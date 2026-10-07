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
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertSdkFingerprint, assertSdkRelativePath, assertSdkSourceUnchanged, assertTwelveFxPackageExports,
  captureSdkSourceFingerprint, fingerprintSdkFiles, requiredFxFamilies, sdkDirectoryFiles,
} from "./sdk-package-manifest.mjs";

export function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) && !isAbsolute(path));
}

export function runNode(args, cwd, options = {}) {
  const env = { ...process.env, ...options.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "npm_config_allow_scripts") delete env[key];
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (options.log) writeFileSync(options.log, (result.stdout ?? "") + (result.stderr ?? ""));
  if (result.error || result.status !== 0) {
    throw new Error(`Command failed (${result.status}): node ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function archiveDigests(bytes) {
  return { archiveSha256: createHash("sha256").update(bytes).digest("hex"), integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
}

function assertArchiveBytes(bytes, manifest) {
  const digest = archiveDigests(bytes);
  assert.equal(digest.archiveSha256, manifest.archiveSha256, "SDK archive SHA-256 mismatch; do not use mutable or stale package output.");
  assert.equal(digest.integrity, manifest.integrity, "SDK archive integrity mismatch.");
}

export function readVerifiedSdkArchive(repositoryRoot, {
  manifestPath = process.env.SYNCLOUDOS_SDK_MANIFEST
    ? resolve(process.env.SYNCLOUDOS_SDK_MANIFEST)
    : resolve(repositoryRoot, ".artifacts/synapp-sdk/build-manifest.json"),
} = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 2, "SDK build-manifest schema 2 is required; ask the build owner to rebuild once source is frozen.");
  assert.equal(manifest.package, "@syndromatic/syncloudos", "Unexpected SDK package identity.");
  assert(/^[a-f0-9]{40,64}$/u.test(manifest.commit), "Missing SDK source commit.");
  assertSdkRelativePath(manifest.archive);
  assert(/^archives\/[^/]+\.tgz$/u.test(manifest.archive), "Unsafe SDK archive path.");
  assert(/^[a-f0-9]{64}$/u.test(manifest.archiveSha256) && /^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(manifest.integrity), "Missing SDK archive integrity.");
  assert(manifest.archive.endsWith(`-${manifest.archiveSha256}.tgz`), "SDK archive filename must contain its immutable SHA-256 identity.");
  assertSdkFingerprint(manifest.source, "source");
  assertSdkFingerprint(manifest.resources, "resource");
  const inventory = new Map(manifest.resources.files.map(file => [file.path, file]));
  const entries = manifest.entries;
  assert(entries && typeof entries === "object", "Missing SDK entry fingerprints.");
  assert.deepEqual(Object.keys(entries).filter(key => /^fx\/[^/]+$/u.test(key.slice(manifest.package.length + 1))).sort(),
    requiredFxFamilies.map(family => `${manifest.package}/fx/${family}`).sort(), "SDK manifest must contain all twelve FX entries.");
  assert.deepEqual(Object.keys(entries).filter(key => /^fx\/[^/]+\//u.test(key.slice(manifest.package.length + 1))),
    [`${manifest.package}/fx/video/webm`], "Only reviewed FX format extensions may be installed.");
  for (const [specifier, entry] of Object.entries(entries)) {
    assert(specifier.startsWith(`${manifest.package}/`), "Invalid SDK entry identity.");
    const name = specifier.slice(manifest.package.length + 1);
    assertSdkRelativePath(name);
    assert.equal(entry.archive, manifest.archive, `SDK entry ${name} does not reference the frozen archive.`);
    assert.equal(entry.index, inventory.get(`${name}.js`)?.sha256, `SDK entry ${name} JS fingerprint mismatch.`);
    assert.equal(entry.types, inventory.get(`${name}.d.ts`)?.sha256, `SDK entry ${name} declaration fingerprint mismatch.`);
    assert(typeof entry.index === "string" && typeof entry.types === "string", `SDK entry ${name} is missing resource targets.`);
  }
  const root = realpathSync.native(dirname(manifestPath));
  const archive = realpathSync.native(resolve(root, manifest.archive));
  assert(isWithin(root, archive), "SDK archive escapes its manifest directory.");
  assertArchiveBytes(readFileSync(archive), manifest);
  return { manifest, manifestPath: resolve(manifestPath), archive, archiveSha256: manifest.archiveSha256,
    integrity: manifest.integrity, sourceSha256: manifest.source.sha256, resourcesSha256: manifest.resources.sha256 };
}

export function copyVerifiedSdkArchive(repositoryRoot, destination, options = {}) {
  const verified = readVerifiedSdkArchive(repositoryRoot, options);
  const archive = join(destination, basename(verified.archive));
  assert(resolve(archive) !== resolve(verified.archive), "Copy destination must be independent of the published archive.");
  copyFileSync(verified.archive, archive);
  // Verify the actual private copy as well: a concurrent replacement must not race installation.
  assertArchiveBytes(readFileSync(archive), verified.manifest);
  return { ...verified, archive };
}

export function verifyInstalledSdkResources(installed, manifest) {
  assertSdkFingerprint(manifest.resources, "resource");
  const actual = fingerprintSdkFiles(installed, sdkDirectoryFiles(installed));
  assert.equal(actual.sha256, manifest.resources.sha256, "Installed SDK resource fingerprint mismatch (missing, changed or extra file).");
  const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  assert.equal(pkg.name, manifest.package, "Installed SDK identity mismatch.");
  assertTwelveFxPackageExports(pkg.exports);
  return actual;
}

export function createInstalledConsumer(repositoryRoot, label = "synware-installed-", options = {}) {
  const verified = readVerifiedSdkArchive(repositoryRoot, options);
  assertSdkSourceUnchanged(verified.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), label)));
  const repository = realpathSync.native(repositoryRoot);
  assert(!isWithin(repository, root), "Installed consumer must be outside the repository.");
  const frozen = copyVerifiedSdkArchive(repositoryRoot, root, { manifestPath: verified.manifestPath });
  assert.deepEqual(frozen.manifest, verified.manifest, "SDK manifest changed while preparing the consumer.");
  const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "synware-independent-consumer", version: "1.0.0", private: true, type: "module" }, null, 2));
  writeFileSync(join(root, ".npmrc"), "audit=false\nfund=false\nignore-scripts=true\n");
  const { archive } = frozen;
  const dependencies = ["react", "react-dom", "@types/react", "@types/react-dom", "typescript", "vite"]
    .map((name) => `${name}@${JSON.parse(readFileSync(join(repository, "node_modules", name, "package.json"), "utf8")).version}`);
  runNode([npm, "install", "--prefer-offline", "--ignore-scripts", "--package-lock=false", archive, ...dependencies], root, { log: join(root, "install.log") });
  const installed = realpathSync.native(join(root, "node_modules/@syndromatic/syncloudos"));
  assert(isWithin(root, installed) && !isWithin(repository, installed), "The SDK must be installed, not linked to the repository.");
  verifyInstalledSdkResources(installed, frozen.manifest);
  return { ...frozen, root, installed, npm };
}

export function assertIndependentModules(root, ids) {
  for (const id of ids) {
    if (id.startsWith("\0") || !isAbsolute(id)) continue;
    const path = id.split("?", 1)[0];
    assert(isWithin(root, existsSync(path) ? realpathSync.native(path) : path), `Consumer resolved a module outside its installation: ${id}`);
    assert(!/[/\\](?:src[/\\])?SynWare[/\\]|[/\\]scripts[/\\]cappuccino[/\\]|[/\\]AppearanceAssets[/\\]/u.test(path), `Consumer resolved a product or provenance module: ${id}`);
  }
}

/** Shared by source-side regression tests and the strict installed declaration gate. */
export function createSdkPublicTypeProbe() {
  return [
    ...requiredFxFamilies.map(family => `import * as ${family} from "@syndromatic/syncloudos/fx/${family}";`),
    `import * as sdk from "@syndromatic/syncloudos/sdk";`,
    `import type { SynWareContextValue } from "@syndromatic/syncloudos/sdk";`,
    `void [${requiredFxFamilies.join(", ")}];`,
    `declare const app: SynWareContextValue;`,
    `const token = sdk.defineSynWareServiceToken<{ read(): string }>({ id: "org.example.package-proof", contractVersion: "proof.v1" });`,
    `const serviceText: string = app.services.require(token).read(); void serviceText;`,
    `// @ts-expect-error Tokens must infer the declared client, not an arbitrary caller type.`,
    `app.services.require(token).missingMethod();`,
    ...[
      "app.runtime", "app.services.registerClient", "app.services.resolveAppClient",
      "app.lumina.createIndex().backend", "app.video.backend", "app.midi.backend", "app.location.backend",
      "sdk.createSynCloudOS", "sdk.ServiceRegistry", "sdk.createSynWareTestHost", "sdk.createMountedLuminaClient",
      "sdk.createMountedSynWareRouter", "sdk.SynWareRouteSessionProvider",
    ].flatMap(expression => [`// @ts-expect-error Ordinary app APIs cannot acquire host or test authority.`, `${expression};`]),
    ...["SynCloudOSRuntime", "ServiceRegistry", "AppRouteSession", "MountedSynWareRouterOptions", "LuminaIndexService", "VideoCaptureService"].flatMap(name => [
      `// @ts-expect-error Host implementation types are not ordinary SDK authoring exports.`,
      `import type { ${name} } from "@syndromatic/syncloudos/sdk";`,
    ]),
    ...["types/SynCloudOS/Runtime/runtimeInstanceTypes.js", "src/SynCloudOS/Runtime/createSynCloudOS", "sdk/internal/runtime", "fx/private"].flatMap((entry, index) => [
      `// @ts-expect-error Physical declaration/source/backend paths are not package exports.`,
      `import * as forbidden${index} from "@syndromatic/syncloudos/${entry}";`,
    ]),
    "",
  ].join("\n");
}

/** Foundation only: no build, server, device request or twelve-family behavior claim. */
export function checkInstalledSdkPackage(repositoryRoot, options = {}) {
  const consumer = createInstalledConsumer(repositoryRoot, "synware-package-foundation-", options);
  const receiptPath = join(consumer.root, "package-foundation.json");
  const receipt = {
    schemaVersion: 1, kind: "package-foundation", commit: consumer.manifest.commit,
    archiveSha256: consumer.archiveSha256, integrity: consumer.integrity,
    sourceSha256: consumer.sourceSha256, resourcesSha256: consumer.resourcesSha256,
    resourceFiles: consumer.manifest.resources.files.length, installedOutsideRepository: true,
    types: {}, families: requiredFxFamilies.map(family => ({ entry: `fx/${family}`, import: "pending", types: "pending" })),
    behavior: "not-run", browser: "not-run", nativeDevice: "not-run", passed: false,
  };
  try {
    writeFileSync(join(consumer.root, "public-types.ts"), createSdkPublicTypeProbe());
    for (const mode of ["NodeNext", "Bundler"]) {
      const config = {
        compilerOptions: { target: "ES2022", module: mode === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: mode,
          jsx: "react-jsx", strict: true, skipLibCheck: false, noEmit: true, lib: ["ES2022", "DOM", "DOM.Iterable"], types: ["vite/client"] },
        files: ["public-types.ts"],
      };
      const configName = `tsconfig.${mode}.json`;
      writeFileSync(join(consumer.root, configName), JSON.stringify(config, null, 2));
      const output = runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", configName, "--listFiles"], consumer.root,
        { log: join(consumer.root, `types-${mode}.log`) });
      const modules = output.split(/\r?\n/u).filter(line => isAbsolute(line));
      assert(modules.length > 12, "Installed typecheck did not report its declaration graph.");
      assertIndependentModules(consumer.root, modules);
      receipt.types[mode] = { passed: true, modules: modules.length, skipLibCheck: false, independent: true };
    }
    for (const row of receipt.families) row.types = "passed";
    writeFileSync(join(consumer.root, "public-imports.mjs"), `
import assert from "node:assert/strict";
import { realpathSync, writeFileSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
const root = realpathSync(".");
const rows = [];
for (const family of ${JSON.stringify(requiredFxFamilies)}) {
  const entry = "@syndromatic/syncloudos/fx/" + family;
  const path = realpathSync(fileURLToPath(import.meta.resolve(entry)));
  const local = relative(root, path);
  assert(!isAbsolute(local) && local !== ".." && !local.startsWith("../") && !local.startsWith("..\\\\"), "Package resolved outside installation");
  const module = await import(entry);
  assert(Object.keys(module).length > 0, "Empty FX runtime entry: " + family);
  rows.push({ entry: "fx/" + family, import: "passed", types: "passed" });
}
const sdk = await import("@syndromatic/syncloudos/sdk");
for (const name of ["createSynCloudOS", "ServiceRegistry", "createSynWareTestHost", "createMountedLuminaClient", "createMountedSynWareRouter", "SynWareRouteSessionProvider"]) assert(!(name in sdk), "Private SDK runtime export: " + name);
for (const entry of ["types/SynCloudOS/Runtime/runtimeInstanceTypes.js", "src/SynCloudOS/Runtime/createSynCloudOS", "sdk/internal/runtime", "fx/private"]) {
  await assert.rejects(import("@syndromatic/syncloudos/" + entry), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
}
writeFileSync("runtime-imports.json", JSON.stringify(rows));
`);
    runNode(["public-imports.mjs"], consumer.root, { log: join(consumer.root, "runtime-imports.log") });
    receipt.families = JSON.parse(readFileSync(join(consumer.root, "runtime-imports.json"), "utf8"));
    verifyInstalledSdkResources(consumer.installed, consumer.manifest);
    assertSdkSourceUnchanged(consumer.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    receipt.passed = true;
    return { ...receipt, receiptPath, consumerRoot: consumer.root };
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error);
    throw new Error(`SDK package foundation failed; inspect ${receiptPath}`, { cause: error });
  } finally {
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    assert(mode === "--verify" || mode === "--check-package", "Usage: node scripts/synware/installed-consumer.mjs --verify|--check-package [--manifest <path>]");
    assert(args.length === 0 || (args.length === 2 && args[0] === "--manifest"), "Only --manifest <path> is supported.");
    const options = args.length ? { manifestPath: resolve(args[1]) } : {};
    const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
    if (mode === "--verify") {
      const verified = readVerifiedSdkArchive(repositoryRoot, options);
      assertSdkSourceUnchanged(verified.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
      process.stdout.write(JSON.stringify({ schemaVersion: 2, archive: verified.archive, archiveSha256: verified.archiveSha256,
        integrity: verified.integrity, sourceSha256: verified.sourceSha256, resourcesSha256: verified.resourcesSha256,
        currentSourceMatches: true, installed: false, behavior: "not-run" }, null, 2) + "\n");
    } else process.stdout.write(JSON.stringify(checkInstalledSdkPackage(repositoryRoot, options), null, 2) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
