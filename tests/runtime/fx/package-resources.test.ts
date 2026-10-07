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

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as contract from "../../../scripts/synware/sdk-package-manifest.mjs";
import * as consumers from "../../../scripts/synware/installed-consumer.mjs";

const roots: string[] = [];
function temporary() { const root = mkdtempSync(join(tmpdir(), "synware-package-contract-")); roots.push(root); return root; }
function write(root: string, path: string, value: string) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value); }
function removeFixtureDirectory(path: string) {
  const absolute = resolve(path);
  if (!roots.some(root => absolute === resolve(root) || absolute.startsWith(resolve(root) + "\\") || absolute.startsWith(resolve(root) + "/"))) throw new Error("Unsafe fixture cleanup");
  rmSync(absolute, { recursive: true, force: true });
}
afterEach(() => {
  for (const root of roots) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + "\\") && !resolve(root).startsWith(resolve(tmpdir()) + "/")) throw new Error("Unsafe fixture cleanup");
    removeFixtureDirectory(root);
  }
  roots.length = 0;
});

function fixture() {
  expect(contract.fingerprintSdkFiles).toBeTypeOf("function");
  const repository = temporary();
  const output = join(repository, ".artifacts/synapp-sdk");
  const packaged = join(output, "packages/syncloudos");
  const families = ["animation", "graphics", "image", "text", "audio", "haptics", "motion", "media", "video", "midi", "location", "lumina", "video/webm"];
  const exports = Object.fromEntries(families.map(f => [`./fx/${f}`, { import: `./fx/${f}.js`, types: `./fx/${f}.d.ts` }]));
  const paths = ["package.json", "assets/image-processing.worker-proof.js", ...families.flatMap(f => [`fx/${f}.js`, `fx/${f}.d.ts`])];
  for (const path of paths) write(packaged, path, path === "package.json" ? JSON.stringify({ name: "@syndromatic/syncloudos", version: "0.0.0-package-fixture", type: "module", exports }) : `// ${path}\n`);
  write(repository, "src/input.ts", "export const value = 1;\n");
  const bytes = Buffer.from("frozen archive bytes");
  const archiveSha256 = createHash("sha256").update(bytes).digest("hex");
  const archive = `archives/sdk-${archiveSha256}.tgz`;
  write(output, archive, bytes.toString());
  const resources = contract.fingerprintSdkFiles(packaged, paths);
  const manifest = { schemaVersion: 2, commit: "a".repeat(40), package: "@syndromatic/syncloudos", archive, archiveSha256, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, source: contract.fingerprintSdkFiles(repository, ["src/input.ts"]), resources,
    entries: Object.fromEntries(families.map(f => [`@syndromatic/syncloudos/fx/${f}`, { archive, index: resources.files.find((x: { path: string }) => x.path === `fx/${f}.js`).sha256, types: resources.files.find((x: { path: string }) => x.path === `fx/${f}.d.ts`).sha256 }])) };
  const save = () => write(output, "build-manifest.json", JSON.stringify(manifest)); save();
  return { repository, output, packaged, paths, manifest, save, bytes };
}

describe("SDK source and resource fingerprints", () => {
  it("invalidates package provenance when public framework artwork changes", () => {
    const root = temporary();
    execFileSync("git", ["init", "--quiet", root]);
    write(root, "src/input.ts", "export const value = 1;");
    write(root, "public/assets/background.svg", "first artwork");
    const before = contract.captureSdkSourceFingerprint(root);
    expect(before.files.map((file: { path: string }) => file.path)).toContain("public/assets/background.svg");
    write(root, "public/assets/background.svg", "changed artwork");
    expect(contract.captureSdkSourceFingerprint(root).sha256).not.toBe(before.sha256);
  });
  it("changes for source edits, additions and deletions, even without a new commit", () => {
    expect(contract.captureSdkSourceFingerprint).toBeTypeOf("function");
    const root = temporary();
    execFileSync("git", ["init", "--quiet", root]);
    write(root, "src/input.ts", "first");
    const first = contract.captureSdkSourceFingerprint(root);
    write(root, "src/input.ts", "other");
    const edited = contract.captureSdkSourceFingerprint(root);
    expect(edited.sha256).not.toBe(first.sha256);
    write(root, "src/new.ts", "new");
    const added = contract.captureSdkSourceFingerprint(root);
    expect(added.sha256).not.toBe(edited.sha256);
    expect(added.files.map((f: { path: string }) => f.path)).toContain("src/new.ts");
    rmSync(join(root, "src/new.ts"));
    expect(contract.captureSdkSourceFingerprint(root)).toEqual(edited);
    write(root, ".artifacts/receipt.json", "unrelated receipt");
    expect(contract.captureSdkSourceFingerprint(root)).toEqual(edited);
  });

  it("fingerprints exact resource bytes and rejects unsafe inventory paths", () => {
    const f = fixture();
    expect(contract.fingerprintSdkFiles(f.packaged, [...f.paths].reverse())).toEqual(f.manifest.resources);
    write(f.packaged, "assets/image-processing.worker-proof.js", "corrupt worker");
    expect(contract.fingerprintSdkFiles(f.packaged, f.paths).sha256).not.toBe(f.manifest.resources.sha256);
    for (const path of ["../escape", "assets/../escape", "C:/escape", "assets\\escape", "/escape"]) {
      expect(() => contract.fingerprintSdkFiles(f.packaged, [path]), path).toThrow(/unsafe|relative/i);
    }
  });

  it("rejects a source mutation between build start and publication", () => {
    expect(contract.assertSdkSourceUnchanged).toBeTypeOf("function");
    const f = fixture();
    write(f.repository, "src/input.ts", "changed during build");
    const after = contract.fingerprintSdkFiles(f.repository, ["src/input.ts"]);
    expect(() => contract.assertSdkSourceUnchanged(f.manifest.source, after)).toThrow(/changed.*build|source.*changed/i);
  });
});

describe("manifest archive consumption", () => {
  it("keeps the resource fingerprint through a real offline pack/install of an isolated fixture", () => {
    const f = fixture(); const destination = temporary();
    const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    const packOutput = JSON.parse(consumers.runNode([npm, "pack", f.packaged, "--json", "--ignore-scripts", "--offline", "--pack-destination", destination], destination));
    const packed = Array.isArray(packOutput) ? packOutput[0] : Object.values(packOutput)[0];
    expect(packed).toMatchObject({ filename: expect.any(String), integrity: expect.stringMatching(/^sha512-/u) });
    const original = join(destination, packed.filename);
    const bytes = readFileSync(original);
    f.manifest.archiveSha256 = createHash("sha256").update(bytes).digest("hex");
    f.manifest.integrity = packed.integrity;
    f.manifest.archive = `archives/sdk-${f.manifest.archiveSha256}.tgz`;
    copyFileSync(original, join(f.output, f.manifest.archive));
    for (const entry of Object.values(f.manifest.entries)) entry.archive = f.manifest.archive;
    f.save();
    const installation = temporary();
    const frozen = consumers.copyVerifiedSdkArchive(f.repository, installation);
    write(installation, "package.json", JSON.stringify({ name: "package-fixture-consumer", version: "0.0.0", private: true }));
    consumers.runNode([npm, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", frozen.archive], installation);
    expect(() => consumers.verifyInstalledSdkResources(join(installation, "node_modules/@syndromatic/syncloudos"), frozen.manifest)).not.toThrow();
  }, 30_000);

  it("copies verified manifest bytes without requiring or repacking the mutable package directory", () => {
    expect(consumers.copyVerifiedSdkArchive).toBeTypeOf("function");
    const f = fixture(); const destination = temporary();
    removeFixtureDirectory(f.packaged);
    const copied = consumers.copyVerifiedSdkArchive(f.repository, destination);
    expect(readFileSync(copied.archive)).toEqual(f.bytes);
    expect(copied.archiveSha256).toBe(f.manifest.archiveSha256);
    expect(copied.integrity).toBe(f.manifest.integrity);
    expect(copied.sourceSha256).toBe(f.manifest.source.sha256);
    expect(copied.resourcesSha256).toBe(f.manifest.resources.sha256);
  });

  it("fails closed for old manifests, modified archives and traversal", () => {
    expect(consumers.readVerifiedSdkArchive).toBeTypeOf("function");
    const f = fixture();
    write(f.output, "build-manifest.json", JSON.stringify({ archive: f.manifest.archive }));
    expect(() => consumers.readVerifiedSdkArchive(f.repository)).toThrow(/schema|rebuild/i);
    f.save(); write(f.output, f.manifest.archive, "different artifact");
    expect(() => consumers.readVerifiedSdkArchive(f.repository)).toThrow(/SHA|integrity/i);
    f.manifest.archive = "../escape.tgz"; f.save();
    expect(() => consumers.readVerifiedSdkArchive(f.repository)).toThrow(/unsafe|archive/i);
  });

  it("rejects tampered fingerprints and missing or modified installed resources", () => {
    expect(consumers.verifyInstalledSdkResources).toBeTypeOf("function");
    const f = fixture();
    expect(() => consumers.verifyInstalledSdkResources(f.packaged, f.manifest)).not.toThrow();
    write(f.packaged, "assets/image-processing.worker-proof.js", "corrupt worker");
    expect(() => consumers.verifyInstalledSdkResources(f.packaged, f.manifest)).toThrow(/resource|fingerprint/i);
    rmSync(join(f.packaged, "assets/image-processing.worker-proof.js"));
    expect(() => consumers.verifyInstalledSdkResources(f.packaged, f.manifest)).toThrow(/resource|missing|ENOENT/i);
    f.manifest.resources.files[0].sha256 = "0".repeat(64); f.save();
    expect(() => consumers.readVerifiedSdkArchive(f.repository)).toThrow(/resource|fingerprint/i);
  });
});
