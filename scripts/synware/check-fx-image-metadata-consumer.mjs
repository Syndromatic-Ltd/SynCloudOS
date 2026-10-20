#!/usr/bin/env node
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
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { assertIndependentModules, createInstalledConsumer, isWithin, runNode } from "./installed-consumer.mjs";
import { assertSdkSourceUnchanged, captureSdkSourceFingerprint } from "./sdk-package-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(repositoryRoot, ".artifacts/synapp-sdk/fx-image-metadata-consumer.json");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (root, path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
const linearWebP = Buffer.from(JSON.parse(readFileSync(join(repositoryRoot, "tests/fixtures/linear-icc-formats.json"), "utf8")).webp, "base64");
let supportedProfile;
for (let offset = 12; offset + 8 <= linearWebP.length;) {
  const length = linearWebP.readUInt32LE(offset + 4);
  if (linearWebP.toString("ascii", offset, offset + 4) === "ICCP") supportedProfile = linearWebP.subarray(offset + 8, offset + 8 + length);
  offset += 8 + length + (length & 1);
}
assert.equal(supportedProfile?.length, 312, "Installed metadata specimen requires the complete linear ICC profile.");
const supportedProfileLiteral = JSON.stringify([...supportedProfile]);
const compressedProfileLiteral = JSON.stringify([...deflateSync(supportedProfile)]);

function staticServer(directory) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(directory, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!isWithin(directory, path)) { response.writeHead(403).end(); return; }
    if (!existsSync(path)) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript" }[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  return new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => accept({ server, url: `http://127.0.0.1:${server.address().port}` })); });
}

const probeSource = `import { useEffect } from "react";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { useSCOS } from "@syndromatic/syncloudos/sdk";
import { createSynWare } from "@syndromatic/syncloudos/sdk/testing";
import { defineWebspring, type WebspringViewProps } from "@syndromatic/syncloudos/webspring";
declare global { interface Window { fxImageMetadata: any; } }
window.fxImageMetadata = { ready: false };
const supportedICC = new Uint8Array(${supportedProfileLiteral});
const compressedICC = new Uint8Array(${compressedProfileLiteral});
async function fixture() {
  const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 2;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "red"; context.fillRect(0, 0, 1, 2);
  context.fillStyle = "blue"; context.fillRect(2, 0, 1, 2);
  const encoded = new Uint8Array(await (await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/jpeg", 1))).arrayBuffer());
  const stripped: number[] = [255, 216]; let cursor = 2;
  while (cursor + 3 < encoded.length) {
    if (encoded[cursor] !== 255 || encoded[cursor + 1] === 218) break;
    const marker = encoded[cursor + 1]; const length = (encoded[cursor + 2]! << 8) | encoded[cursor + 3]!;
    if (length < 2 || cursor + 2 + length > encoded.length) break;
    const isICC = marker === 226 && encoded[cursor + 4] === 73 && encoded[cursor + 5] === 67 && encoded[cursor + 6] === 67;
    if (!isICC) stripped.push(...encoded.subarray(cursor, cursor + 2 + length));
    cursor += 2 + length;
  }
  stripped.push(...encoded.subarray(cursor));
  const original = new Uint8Array(stripped);
  const tiff = new Uint8Array(26); const view = new DataView(tiff.buffer);
  tiff.set([73, 73]); view.setUint16(2, 42, true); view.setUint32(4, 8, true); view.setUint16(8, 1, true);
  view.setUint16(10, 274, true); view.setUint16(12, 3, true); view.setUint32(14, 1, true); view.setUint16(18, 6, true);
  const exif = new Uint8Array([255, 225, 0, 34, 69, 120, 105, 102, 0, 0, ...tiff]);
  const chunks = [0, 1].map(index => {
    const half = supportedICC.subarray(index * 156, (index + 1) * 156);
    const length = 2 + 14 + half.length;
    return new Uint8Array([255, 226, length >>> 8, length & 255, 73, 67, 67, 95, 80, 82, 79, 70, 73, 76, 69, 0, index + 1, 2, ...half]);
  });
  const bytes = new Uint8Array(original.length + exif.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  bytes.set(original.subarray(0, 2)); bytes.set(exif, 2); let position = 2 + exif.length;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  bytes.set(original.subarray(2), position);
  return bytes;
}
async function webpFixture() {
  const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 2;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "white"; context.fillRect(0, 0, 3, 2);
  context.fillStyle = "red"; context.fillRect(0, 0, 1, 2);
  context.fillStyle = "blue"; context.fillRect(2, 0, 1, 2);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), "image/webp", 1));
  if (blob.type !== "image/webp") throw new Error("Browser did not encode WebP for the installed metadata fixture.");
  const encoded = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(encoded.buffer); let imageChunk: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= encoded.length;) {
    const length = view.getUint32(offset + 4, true), end = offset + 8 + length + (length & 1);
    if (end > encoded.length) throw new Error("Browser WebP fixture has a truncated chunk.");
    const name = new TextDecoder().decode(encoded.subarray(offset, offset + 4));
    if (name === "VP8 " || name === "VP8L") {
      if (imageChunk) throw new Error("Browser WebP fixture has multiple image bitstreams.");
      imageChunk = encoded.subarray(offset, end);
    }
    offset = end;
  }
  if (!imageChunk) throw new Error("Browser WebP fixture has no image bitstream.");
  const tiff = new Uint8Array(26), tiffView = new DataView(tiff.buffer);
  tiff.set([73, 73]); tiffView.setUint16(2, 42, true); tiffView.setUint32(4, 8, true);
  tiffView.setUint16(8, 1, true); tiffView.setUint16(10, 274, true);
  tiffView.setUint16(12, 3, true); tiffView.setUint32(14, 1, true); tiffView.setUint16(18, 6, true);
  const profile = supportedICC;
  const chunk = (name: string, payload: Uint8Array) => new Uint8Array([
    ...new TextEncoder().encode(name), payload.length & 255, (payload.length >>> 8) & 255,
    (payload.length >>> 16) & 255, (payload.length >>> 24) & 255,
    ...payload, ...(payload.length & 1 ? [0] : []),
  ]);
  const chunks = [chunk("VP8X", new Uint8Array([0x28, 0, 0, 0, 2, 0, 0, 1, 0, 0])), chunk("ICCP", profile), imageChunk, chunk("EXIF", tiff)];
  const total = 12 + chunks.reduce((sum, item) => sum + item.length, 0), bytes = new Uint8Array(total);
  bytes.set(new TextEncoder().encode("RIFF")); new DataView(bytes.buffer).setUint32(4, total - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  let position = 12; for (const item of chunks) { bytes.set(item, position); position += item.length; }
  return bytes;
}
async function pngFixture() {
  const canvas = document.createElement("canvas"); canvas.width = 3; canvas.height = 2;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "red"; context.fillRect(0, 0, 1, 2);
  context.fillStyle = "blue"; context.fillRect(2, 0, 1, 2);
  const encoded = new Uint8Array(await (await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"))).arrayBuffer());
  const tiff = new Uint8Array(26), tiffView = new DataView(tiff.buffer);
  tiff.set([73, 73]); tiffView.setUint16(2, 42, true); tiffView.setUint32(4, 8, true);
  tiffView.setUint16(8, 1, true); tiffView.setUint16(10, 274, true);
  tiffView.setUint16(12, 3, true); tiffView.setUint32(14, 1, true); tiffView.setUint16(18, 6, true);
  const chunk = (name: string, payload: Uint8Array) => {
    const result = new Uint8Array(payload.length + 12), view = new DataView(result.buffer);
    view.setUint32(0, payload.length); result.set(new TextEncoder().encode(name), 4); result.set(payload, 8);
    let crc = 0xffffffff;
    for (const byte of result.subarray(4, result.length - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
    return result;
  };
  const exif = chunk("eXIf", tiff);
  const icc = chunk("iCCP", new Uint8Array([115, 82, 71, 66, 0, 0, ...compressedICC]));
  const view = new DataView(encoded.buffer);
  const originalChunks: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= encoded.length;) {
    const length = view.getUint32(offset);
    const name = new TextDecoder().decode(encoded.subarray(offset + 4, offset + 8));
    if (offset + 12 + length > encoded.length) throw new Error("PNG fixture chunk is truncated.");
    if (name !== "iCCP") originalChunks.push(encoded.subarray(offset, offset + 12 + length));
    offset += length + 12;
    if (name === "IEND") break;
  }
  if (originalChunks[0]?.[4] !== 73 || originalChunks.at(-1)?.[4] !== 73) throw new Error("PNG fixture has no IHDR or IEND chunk.");
  const bytes = new Uint8Array(8 + originalChunks.reduce((sum, part) => sum + part.length, 0) + exif.length + icc.length);
  bytes.set(encoded.subarray(0, 8)); let position = 8;
  bytes.set(originalChunks[0]!, position); position += originalChunks[0]!.length;
  bytes.set(icc, position); position += icc.length;
  for (const part of originalChunks.slice(1, -1)) { bytes.set(part, position); position += part.length; }
  bytes.set(exif, position); position += exif.length;
  bytes.set(originalChunks.at(-1)!, position);
  return bytes;
}
function gifFixture() {
  const base = Uint8Array.from(atob("R0lGODlhAQABAAD/ACwAAAAAAQABAAACAUwAOw=="), character => character.charCodeAt(0));
  const descriptor = base.indexOf(0x2c, 13);
  if (descriptor < 0) throw new Error("GIF metadata fixture has no image descriptor.");
  const profile = supportedICC;
  const extension = new Uint8Array([33, 255, 11, ...new TextEncoder().encode("ICCRGBG1012"), 255, ...profile.subarray(0, 255), 57, ...profile.subarray(255), 0]);
  const bytes = new Uint8Array(base.length + extension.length);
  bytes.set(base.subarray(0, descriptor)); bytes.set(extension, descriptor);
  bytes.set(base.subarray(descriptor), descriptor + extension.length);
  return bytes;
}
function Probe() {
  const app = useSCOS();
  useEffect(() => { void (async () => {
    const resource = app.images.load({ source: { kind: "bytes", mimeType: "image/jpeg", bytes: await fixture() }, accessibleLabel: "Metadata probe" });
    try {
      await resource.ready;
      const profile = resource.sourceICCProfile;
      const profileBytes = profile ? Array.from(profile.slice(36, 40)) : null;
      if (profile) profile[36] = 0;
      const copied = resource.sourceICCProfile?.[36] === 97;
      const lease = await resource.pixelLease();
      const pixels = lease.copyImage(); lease.release();
      const ready = { sourceOrientation: resource.sourceOrientation, profileLength: profile?.length ?? null, profileBytes,
        copied, size: resource.intrinsicSize, pixelSize: [pixels.width, pixels.height], topRight: pixels.pixel(1, 0), bottomLeft: pixels.pixel(0, 2) };
      resource.release();
      const webp = app.images.load({ source: { kind: "bytes", mimeType: "image/webp", bytes: await webpFixture() }, accessibleLabel: "WebP metadata probe" });
      let webpReady;
      try {
        await webp.ready;
        const webpProfile = webp.sourceICCProfile;
        const webpLease = await webp.pixelLease();
        const webpPixels = webpLease.copyImage(); webpLease.release();
        webpReady = { sourceOrientation: webp.sourceOrientation, profileLength: webpProfile?.length ?? null,
          profileBytes: webpProfile ? Array.from(webpProfile.slice(36, 40)) : null,
          size: webp.intrinsicSize, pixelSize: [webpPixels.width, webpPixels.height],
          topLeft: webpPixels.pixel(0, 0), topRight: webpPixels.pixel(2, 0) };
      } finally { webp.release(); }
      const png = app.images.load({ source: { kind: "bytes", mimeType: "image/png", bytes: await pngFixture() }, accessibleLabel: "PNG metadata probe" });
      let pngReady;
      try {
        await png.ready;
        const pngProfile = png.sourceICCProfile;
        const pngProfileBytes = pngProfile ? Array.from(pngProfile.slice(36, 40)) : null;
        if (pngProfile) pngProfile[36] = 0;
        const copied = png.sourceICCProfile?.[36] === 97;
        const lease = await png.pixelLease();
        const pixels = lease.copyImage(); lease.release();
        pngReady = { sourceOrientation: png.sourceOrientation, profileLength: pngProfile?.length ?? null, pngProfileBytes, copied,
          size: png.intrinsicSize, pixelSize: [pixels.width, pixels.height] };
      } finally { png.release(); }
      const gif = app.images.load({ source: { kind: "bytes", mimeType: "image/gif", bytes: gifFixture() }, accessibleLabel: "GIF metadata probe" });
      let gifReady;
      try {
        await gif.ready;
        const profile = gif.sourceICCProfile;
        const profileBytes = profile ? Array.from(profile.slice(36, 40)) : null;
        if (profile) profile[36] = 0;
        gifReady = { size: gif.intrinsicSize, profileLength: profile?.length ?? null, profileBytes,
          copied: gif.sourceICCProfile?.[36] === 97 };
      } finally { gif.release(); }
      window.fxImageMetadata = { ready: true, ...ready,
        webp: { ...webpReady, releasedOrientation: webp.sourceOrientation, releasedProfile: webp.sourceICCProfile },
        png: { ...pngReady, releasedOrientation: png.sourceOrientation, releasedProfile: png.sourceICCProfile },
        gif: { ...gifReady, releasedProfile: gif.sourceICCProfile },
        releasedOrientation: resource.sourceOrientation, releasedProfile: resource.sourceICCProfile };
    } finally { resource.release(); }
  })().catch(error => { window.fxImageMetadata = { ready: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }; }); }, [app]);
  return <p>Installed IFX-01 metadata probe</p>;
}
function Website({ actions, applicationOutlet }: WebspringViewProps) {
  return <main><button id="open" onClick={() => { void actions.openApp("org.example.image-metadata"); }}>Open image metadata probe</button>{applicationOutlet}</main>;
}
const shell = defineWebspring({ manifest: { schemaVersion: 1, bundleIdentifier: "org.example.image-metadata-shell", version: "1.0.0", displayName: "Image metadata shell",
  webspringShell: { views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
    defaults: { desktop: "website", tablet: "website", mobile: "website" }, homeRoute: "/", branding: { name: { key: "brand", fallback: "Image metadata" } } } },
  components: { website: Website } });
const app = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "org.example.image-metadata", version: "1.0.0", displayName: "Image metadata probe",
  runtime: { policy: { public: true } }, presentations: ["desktop", "tablet", "mobile"],
  routes: [{ path: "/image-metadata", primary: true }], webspring: { visible: true, order: 1 } }, root: Probe });
mountSynCloudOS({ element: document.getElementById("root")!, bundles: [app], shell, authentication: "disabled" })
  .then(host => { window.fxImageMetadata.dispose = () => host.dispose("installed image metadata complete"); })
  .catch(error => { window.fxImageMetadata = { ready: false, error: String(error) }; });
`;

async function main() {
  const manifestIndex = process.argv.indexOf("--manifest");
  if (manifestIndex >= 0 && !process.argv[manifestIndex + 1]) throw new Error("--manifest requires a path.");
  const consumer = createInstalledConsumer(repositoryRoot, "synware-fx-image-metadata-", manifestIndex < 0 ? {} : { manifestPath: resolve(process.argv[manifestIndex + 1]) });
  const evidence = { schemaVersion: 1, kind: "installed-ifx01-jpeg-webp-png-gif-exif-icc-metadata", archiveSHA256: hash(readFileSync(consumer.archive)),
    sourceSHA256: consumer.sourceSha256, installedOutsideRepository: true, fixtureSHA256: hash(probeSource), typecheck: false,
    packageGraph: null, chromium: null, nativeReference: "OPEN", passed: false };
  let hosted;
  try {
    write(consumer.root, "tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, skipLibCheck: false, noEmit: true, types: ["vite/client"] }, include: ["src"] }));
    write(consumer.root, "src/main.tsx", probeSource);
    write(consumer.root, "index.html", '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    write(consumer.root, "vite.config.mjs", 'import { writeFileSync } from "node:fs"; export default { plugins: [{ name: "record-inputs", generateBundle() { writeFileSync("resolved-modules.json", JSON.stringify([...this.getModuleIds()].sort(), null, 2)); } }], build: { sourcemap: false } };');
    runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root, { log: join(consumer.root, "typecheck.log") });
    evidence.typecheck = true;
    runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root, { log: join(consumer.root, "build.log") });
    const modules = JSON.parse(readFileSync(join(consumer.root, "resolved-modules.json"), "utf8"));
    assertIndependentModules(consumer.root, modules);
    evidence.packageGraph = { modules: modules.length, allResolvedInsideInstallation: true };
    hosted = await staticServer(join(consumer.root, "dist"));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(hosted.url); await page.waitForLoadState("networkidle"); await page.locator("#open").click();
      await page.waitForFunction(() => window.fxImageMetadata?.ready || window.fxImageMetadata?.error, undefined, { timeout: 30_000 });
      const result = await page.evaluate(() => window.fxImageMetadata);
      assert.equal(result.error, undefined, result.error ?? "Installed image metadata probe failed.");
      assert.equal(result.sourceOrientation, 6); assert.equal(result.profileLength, 312);
      assert.deepEqual(result.profileBytes, [97, 99, 115, 112]); assert.equal(result.copied, true);
      assert.deepEqual(result.size, { width: 2, height: 3 }); assert.deepEqual(result.pixelSize, [2, 3]);
      assert(result.topRight.r > result.topRight.b); assert(result.bottomLeft.b > result.bottomLeft.r);
      assert.equal(result.releasedOrientation, null); assert.equal(result.releasedProfile, null);
      assert.equal(result.webp.sourceOrientation, 6); assert.equal(result.webp.profileLength, 312);
      assert.deepEqual(result.webp.profileBytes, [97, 99, 115, 112]);
      assert.deepEqual(result.webp.size, { width: 3, height: 2 }); assert.deepEqual(result.webp.pixelSize, [3, 2]);
      assert(result.webp.topLeft.r > result.webp.topLeft.b); assert(result.webp.topRight.b > result.webp.topRight.r);
      assert.equal(result.webp.releasedOrientation, null); assert.equal(result.webp.releasedProfile, null);
      assert.equal(result.png.sourceOrientation, 6); assert.equal(result.png.profileLength, 312);
      assert.deepEqual(result.png.pngProfileBytes, [97, 99, 115, 112]); assert.equal(result.png.copied, true);
      assert.equal(result.png.pixelSize.reduce((area, side) => area * side, 1), 6);
      assert.equal(result.png.releasedOrientation, null); assert.equal(result.png.releasedProfile, null);
      assert.deepEqual(result.gif.size, { width: 1, height: 1 }); assert.equal(result.gif.profileLength, 312);
      assert.deepEqual(result.gif.profileBytes, [97, 99, 115, 112]); assert.equal(result.gif.copied, true);
      assert.equal(result.gif.releasedProfile, null);
      assert.deepEqual(errors, []);
      evidence.chromium = { ...result, pageErrors: errors };
      await page.evaluate(() => window.fxImageMetadata.dispose?.());
    } finally { await browser.close(); }
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    evidence.passed = true;
    console.log(JSON.stringify({ passed: true, archiveSHA256: evidence.archiveSHA256, chromium: evidence.chromium }, null, 2));
  } catch (error) { evidence.error = error instanceof Error ? error.stack : String(error); evidence.retainedConsumer = consumer.root; throw error; }
  finally {
    if (hosted) await new Promise(resolve => hosted.server.close(resolve));
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    if (evidence.passed && !process.argv.includes("--keep")) rmSync(consumer.root, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
