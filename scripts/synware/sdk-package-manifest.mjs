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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const requiredFxFamilies = Object.freeze([
  "animation", "graphics", "image", "text", "audio", "haptics", "motion",
  "media", "video", "midi", "location", "lumina",
]);

export function assertTwelveFxPackageExports(exports) {
  assert(exports && typeof exports === "object", "SDK exports must describe all twelve FX families.");
  assert.deepEqual(Object.keys(exports).filter(key => /^\.\/fx\/[^/]+$/u.test(key)).sort(),
    requiredFxFamilies.map(family => `./fx/${family}`).sort(), "SDK must export exactly the twelve FX families.");
  assert.deepEqual(Object.keys(exports).filter(key => /^\.\/fx\/[^/]+\//u.test(key)),
    ["./fx/video/webm"], "Only reviewed FX format extensions may be exported.");
  assert.deepEqual(exports["./fx/video/webm"],
    { types: "./fx/video/webm.d.ts", import: "./fx/video/webm.js" }, "Invalid WebM extension targets.");
  for (const key of Object.keys(exports)) {
    assert(key.startsWith("./") && !key.includes("*") && !/\/(?:src|types|internal|private)(?:\/|$)/u.test(key), `Private SDK export is forbidden: ${key}`);
    assertSdkRelativePath(key.slice(2));
  }
  for (const family of requiredFxFamilies) {
    const entry = exports[`./fx/${family}`];
    assert.deepEqual(entry, { types: `./fx/${family}.d.ts`, import: `./fx/${family}.js` }, `Invalid public targets for fx/${family}.`);
  }
}

export function assertSdkRelativePath(path) {
  assert(typeof path === "string" && path.length > 0 && !isAbsolute(path) && !/[:\\\x00]/u.test(path)
    && path.split("/").every(part => part !== "" && part !== "." && part !== ".."), `Unsafe SDK relative path: ${path}`);
}

function containedPath(root, path) {
  assertSdkRelativePath(path);
  const target = resolve(root, path);
  const within = relative(realpathSync(root), realpathSync(target));
  assert(within !== ".." && !within.startsWith("../") && !within.startsWith("..\\") && !isAbsolute(within), `SDK path escapes its root: ${path}`);
  assert(lstatSync(target).isFile(), `SDK input is not a regular file: ${path}`);
  return target;
}

export function sdkFingerprintDigest(files) {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}

/** Exact bytes, sorted paths and lengths; timestamps never define artifact identity. */
export function fingerprintSdkFiles(root, paths) {
  const files = [...new Set(paths)].sort().map(path => {
    const bytes = readFileSync(containedPath(root, path));
    return { path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  return { sha256: sdkFingerprintDigest(files), files };
}

export function sdkDirectoryFiles(root, prefix = "") {
  return readdirSync(resolve(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), `SDK inventory cannot contain a link: ${path}`);
    if (entry.isDirectory()) return sdkDirectoryFiles(root, path);
    assert(entry.isFile(), `SDK inventory cannot contain a special file: ${path}`);
    return [path];
  }).sort();
}

/** Include untracked implementation and build inputs, exclude tests/docs/receipts. */
export function captureSdkSourceFingerprint(repositoryRoot) {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--",
    "src", "public", "scripts/synware", "package.json", "package-lock.json", "LICENSE", "NOTICE", "THIRD_PARTY.md", "ARTWORK.md", "licenses", ":(glob)tsconfig*.json", ".npmrc"],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).split("\0").filter(Boolean);
  // Tracked deletions remain in the inventory so they cannot retain the old hash.
  const missing = paths.filter(path => {
    try { lstatSync(resolve(repositoryRoot, path)); return false; }
    catch (error) { if (error.code === "ENOENT") return true; throw error; }
  });
  const missingSet = new Set(missing);
  const present = fingerprintSdkFiles(repositoryRoot, paths.filter(path => !missingSet.has(path)));
  const files = [...present.files, ...missing.map(path => ({ path, bytes: 0, sha256: null, deleted: true }))]
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { sha256: sdkFingerprintDigest(files), files };
}

export function assertSdkSourceUnchanged(before, after) {
  assert.equal(after.sha256, before.sha256, "SDK source changed during build/acceptance; freeze the working source and rebuild before publishing a receipt.");
}

export function assertSdkFingerprint(value, label) {
  assert(value && /^[a-f0-9]{64}$/u.test(value.sha256) && Array.isArray(value.files) && value.files.length > 0, `Missing ${label} fingerprint.`);
  let previous = "";
  for (const file of value.files) {
    assertSdkRelativePath(file.path);
    assert(file.path > previous, `Unsorted or duplicate ${label} fingerprint path: ${file.path}`);
    assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0, `Invalid ${label} byte length.`);
    assert(/^[a-f0-9]{64}$/u.test(file.sha256) || (label === "source" && file.deleted === true && file.sha256 === null && file.bytes === 0), `Invalid ${label} file hash.`);
    previous = file.path;
  }
  assert.equal(sdkFingerprintDigest(value.files), value.sha256, `${label} fingerprint mismatch.`);
}

/** Build the small, reviewed package manifests used by the portable SDK. */
export function createSdkPackageManifest({ name, exports, files, peerDependencies, dependencies = undefined }) {
  return {
    name,
    version: "1.0.0-beta.1",
    private: false,
    type: "module",
    license: "AGPL-3.0-or-later AND Apache-2.0",
    repository: { type: "git", url: "https://github.com/Syndromatic-Ltd/SynCloudOS.git" },
    homepage: "https://github.com/Syndromatic-Ltd/SynCloudOS#readme",
    bugs: { url: "https://github.com/Syndromatic-Ltd/SynCloudOS/issues" },
    sideEffects: ["**/*.css"],
    exports,
    files: [...files].sort(),
    peerDependencies,
    ...(dependencies && Object.keys(dependencies).length > 0 ? { dependencies } : {}),
  };
}

export function assertReviewedPackageFiles(files) {
  for (const file of files) {
    if (file.includes("\\") || file.split("/").some((part) => part === ".." || part === "." || part === "")) {
      throw new TypeError(`SDK package contains an unsafe file path: ${file}`);
    }
    if (file.startsWith("types/FrameworkTests/")) throw new TypeError(`SDK package contains a test fixture: ${file}`);
    if (["LICENSE", "NOTICE", "THIRD_PARTY.md", "ARTWORK.md", "sdk/LICENSE", "sdk/NOTICE", "sdk/package.json", "licenses/dependencies.json"].includes(file)) continue;
    if (/^licenses\/(?:dependencies\/)?[A-Za-z0-9._-]+\/(?:(?:MIT|APACHE|BSD)[.-])?(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[.-][A-Za-z0-9._-]+)?$/iu.test(file)) continue;
    if (/^licenses\/[A-Za-z0-9._-]+\.(?:txt|md)$/u.test(file)) continue;
    if (/^licenses\/(?:harfbuzzjs\.txt|harfbuzzjs-provenance\.json|pdfjs-dist\.txt|woff2-encoder\.txt|woff2-third-party\.txt)$/u.test(file)) continue;
    if (/^assets\/pdf\.worker\.min-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^assets\/pdf-document\.worker-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^assets\/AUFXAudioRenderRuntime-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^assets\/lumina-index\.worker-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^assets\/image-processing\.worker-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^assets\/video-processing\.worker-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^assets\/browserResponsiveness\.worker-[A-Za-z0-9_-]+\.js$/u.test(file)) continue;
    if (/^nse\/themes\/atmo\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._@-]+\.(?:css|png|webp|svg|jpg|jpeg|gif|avif|woff2?|ttf|otf)$/u.test(file)) continue;
    if (/^assets\/[A-Za-z0-9_-]+\.css$/u.test(file)) continue;
    if (file === "webspring/styles.css" || file === "chronosphere/styles.css") continue;
    if (/^fx\/video\/webm\.(?:js|d\.ts)$/u.test(file)) continue;
    if (!/^(?:(?:(?:sdk|nse)(?:\/(?:[a-z][a-z-]*\/)*[a-z][a-z-]*)?|auth|browser|typography|server\/auth|webspring|chronosphere|fx\/(?:animation|graphics|image|text|audio|haptics|motion|media|video|midi|location|lumina))\.(?:js|d\.ts|css)|browser\/styles\.css|vite\.mjs|chunks\/[A-Za-z0-9_-]+\.js|assets\/[A-Za-z0-9._-]+\.(?:png|webp|svg|jpg|jpeg|gif|woff2?|ttf|otf)|README\.md|types\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:d\.ts|d\.mts|mjs|json))$/u.test(file)) {
      throw new TypeError(`SDK package contains an unreviewed public file: ${file}`);
    }
  }
}
