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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readVerifiedSdkArchive } from "../synware/installed-consumer.mjs";
import {
  assertSdkSourceUnchanged,
  captureSdkSourceFingerprint,
  requiredFxFamilies,
} from "../synware/sdk-package-manifest.mjs";

const TWELVE_FX_FAMILIES = Object.freeze([
  "animation", "graphics", "image", "text", "audio", "haptics", "motion",
  "media", "video", "midi", "location", "lumina",
]);

assert.deepEqual(requiredFxFamilies, TWELVE_FX_FAMILIES, "Installed acceptance family list must match the package manifest contract.");

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function assertCompleteFamilyMatrix(rows) {
  assert(Array.isArray(rows), "Twelve-FX receipt familyResults must be an array.");
  assert.deepEqual(rows.map(row => row?.family), TWELVE_FX_FAMILIES,
    "Installed acceptance must retain exactly one explicit row for every one of the twelve FX families.");
}

function createInitialTwelveFxReceipt({ manifest, manifestPath, mode, base = "/" }) {
  assert.equal(manifest.schemaVersion, 2, "Installed twelve-FX acceptance requires SDK manifest schema 2.");
  assert(mode === "deterministic" || mode === "browser", `Unsupported installed acceptance mode: ${mode}`);
  const familyResults = TWELVE_FX_FAMILIES.map(family => ({
    family,
    I: manifest.entries?.[`@syndromatic/syncloudos/fx/${family}`] ? "passed" : "failed",
    D: "not-run",
    B: "not-run",
    P: "not-run",
    H: "OPEN-physical-native",
    assertions: [],
  }));
  assertCompleteFamilyMatrix(familyResults);
  assert(familyResults.every(row => row.I === "passed"), "Verified SDK manifest is missing a required FX family entry.");
  return {
    schemaVersion: 2,
    kind: "installed-twelve-fx-acceptance",
    mode,
    base,
    startedAt: new Date().toISOString(),
    sourceCommit: manifest.commit,
    archiveSHA256: manifest.archiveSha256,
    archiveIntegrity: manifest.integrity,
    sourceSHA256: manifest.source.sha256,
    resourcesSHA256: manifest.resources.sha256,
    manifestPath: resolve(manifestPath),
    familyResults,
    commands: [],
    failures: [],
    passed: false,
  };
}

function parseArgs(args) {
  let mode = "deterministic";
  let manifestPath;
  let base = "/";
  let keep = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--keep") { keep = true; continue; }
    if (argument === "--mode") { mode = args[++index]; continue; }
    if (argument.startsWith("--mode=")) { mode = argument.slice(7); continue; }
    if (argument === "--manifest") { manifestPath = resolve(args[++index]); continue; }
    if (argument.startsWith("--manifest=")) { manifestPath = resolve(argument.slice(11)); continue; }
    if (argument === "--base") { base = args[++index]; continue; }
    if (argument.startsWith("--base=")) { base = argument.slice(7); continue; }
    throw new Error(`Unknown argument: ${argument}`);
  }
  assert(mode === "deterministic" || mode === "browser", "--mode must be deterministic or browser.");
  assert(typeof base === "string" && base.startsWith("/") && base.endsWith("/"), "--base must be an absolute URL path ending in /.");
  return { mode, manifestPath, base, keep };
}

function updateFamilies(receipt, families, dimension, value, assertionText) {
  for (const family of families) {
    const row = receipt.familyResults.find(candidate => candidate.family === family);
    assert(row, `Unknown FX family: ${family}`);
    row[dimension] = value;
    if (assertionText) row.assertions.push(assertionText);
  }
}

function execute(receipt, { id, args, families, dimension, assertionText, environment }) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const command = {
    id,
    executable: process.execPath,
    args,
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode: result.status,
  };
  receipt.commands.push(command);
  if (result.error || result.status !== 0) {
    const failure = {
      id,
      families,
      dimension,
      error: result.error?.message ?? `exit ${result.status}`,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
    receipt.failures.push(failure);
    updateFamilies(receipt, families, dimension, "failed", `${id}: failed`);
    throw new Error(`Installed acceptance command failed: ${id}\n${failure.error}\n${failure.stdout}\n${failure.stderr}`);
  }
  updateFamilies(receipt, families, dimension, "passed", assertionText ?? `${id}: passed`);
  return result.stdout ?? "";
}

const deterministicScenarios = Object.freeze([
  {
    id: "original-seven-substantive",
    test: "tests/runtime/fx/packed-fx.test.ts",
    families: ["animation", "graphics", "image", "text", "audio", "haptics", "motion"],
    assertionText: "Installed original-seven substantive specimen passed from the verified archive.",
  },
  {
    id: "media-substantive",
    test: "tests/runtime/fx/packed-media.test.ts",
    families: ["media"],
    assertionText: "Installed MediaFX value, ownership, clock and mounted public-contract specimen passed.",
  },
  {
    id: "video-substantive",
    test: "tests/runtime/fx/packed-video.test.ts",
    families: ["video"],
    assertionText: "Installed VideoFX frame, decoder, ownership and declaration specimen passed.",
  },
  {
    id: "video-capture-substantive",
    test: "tests/runtime/fx/packed-video-capture.test.ts",
    families: ["video"],
    assertionText: "Installed VideoFX scoped capture denial/allow/teardown specimen passed.",
  },
  {
    id: "midi-location-substantive",
    test: "tests/runtime/fx/packed-value-foundations.test.ts",
    families: ["midi", "location"],
    assertionText: "Installed MIDIFX and LocationFX value, scheduling, authorization and mounted specimens passed.",
  },
  {
    id: "lumina-substantive",
    test: "tests/runtime/fx/packed-lumina.test.ts",
    families: ["lumina"],
    assertionText: "Installed LuminaFX named-route, query, mutation and public declaration specimen passed.",
  },
]);

const browserScenarios = Object.freeze([
  { id: "lifecycle-browser-root", script: "scripts/synware/check-fx-browser-lifecycle-consumer.mjs", families: ["animation", "haptics", "motion", "midi", "location"], args: ["--base", "/"] },
  { id: "lifecycle-browser-nested", script: "scripts/synware/check-fx-browser-lifecycle-consumer.mjs", families: ["animation", "haptics", "motion", "midi", "location"], useAggregateBase: true },
  { id: "graphics-pdf-browser", script: "scripts/synware/check-fx-pdf-consumer.mjs", families: ["graphics"] },
  { id: "image-metadata-browser", script: "scripts/synware/check-fx-image-metadata-consumer.mjs", families: ["image"] },
  { id: "text-browser", script: "scripts/synware/check-fx-text-consumer.mjs", families: ["text"] },
  { id: "video-browser", script: "scripts/synware/check-fx-video-consumer.mjs", families: ["video"] },
  { id: "video-encode-browser", script: "scripts/synware/check-fx-video-encode-consumer.mjs", families: ["video"] },
  { id: "audio-opus-browser", script: "scripts/synware/check-fx-audio-codec-consumer.mjs", families: ["audio", "video"] },
  { id: "media-timeline-browser", script: "scripts/synware/check-fx-media-timeline-consumer.mjs", families: ["image", "audio", "media", "video"] },
  { id: "lumina-storage-worker-browser", script: "scripts/synware/check-omitted-products-consumer.mjs", families: ["lumina"] },
]);

const BROWSER_ACCEPTANCE_FAMILIES = Object.freeze(
  TWELVE_FX_FAMILIES.filter(family => browserScenarios.some(scenario => scenario.families.includes(family))),
);
assert.deepEqual(BROWSER_ACCEPTANCE_FAMILIES, TWELVE_FX_FAMILIES,
  "Installed browser acceptance must retain at least one explicit scenario for every FX family.");

function receiptDirectory() {
  const directory = resolve(repositoryRoot, ".artifacts/expanded-fx/installed");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function persistReceipt(receipt) {
  const safeTime = receipt.startedAt.replaceAll(/[:.]/gu, "-");
  const path = join(receiptDirectory(), `${safeTime}-${receipt.mode}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  writeFileSync(join(receiptDirectory(), `latest-${receipt.mode}.json`), JSON.stringify(receipt, null, 2) + "\n");
  return path;
}

function runInstalledTwelveFx({ mode, manifestPath, base = "/", keep = false }) {
  const verified = readVerifiedSdkArchive(repositoryRoot, manifestPath ? { manifestPath } : {});
  assertSdkSourceUnchanged(verified.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
  const receipt = createInitialTwelveFxReceipt({ manifest: verified.manifest, manifestPath: verified.manifestPath, mode, base });
  const environment = { SYNCLOUDOS_SDK_MANIFEST: verified.manifestPath };
  try {
    if (mode === "deterministic") {
      const vitest = resolve(repositoryRoot, "node_modules/vitest/vitest.mjs");
      for (const scenario of deterministicScenarios) {
        execute(receipt, {
          id: scenario.id,
          args: [vitest, "run", scenario.test, "--maxWorkers=1", "--no-file-parallelism"],
          families: scenario.families,
          dimension: "D",
          assertionText: scenario.assertionText,
          environment,
        });
      }
      assert(receipt.familyResults.every(row => row.I === "passed" && row.D === "passed"),
        "Deterministic acceptance is missing a required family result.");
    } else {
      for (const scenario of browserScenarios) {
        const scenarioArguments = scenario.useAggregateBase
          ? ["--base", base]
          : scenario.args ?? [];
        execute(receipt, {
          id: scenario.id,
          args: [resolve(repositoryRoot, scenario.script), ...scenarioArguments, ...(keep ? ["--keep"] : [])],
          families: scenario.families,
          dimension: "B",
          assertionText: `${scenario.id}: installed browser acceptance passed.`,
          environment,
        });
      }
      assert(receipt.familyResults.every(row => row.I === "passed" && row.B === "passed"),
        "Installed browser acceptance still has families without browser evidence.");
    }
    assertSdkSourceUnchanged(verified.manifest.source, captureSdkSourceFingerprint(repositoryRoot));
    receipt.passed = true;
    return { receipt, receiptPath: persistReceipt(receipt) };
  } catch (error) {
    if (!receipt.failures.length) receipt.failures.push({ id: "aggregate", error: error instanceof Error ? error.message : String(error) });
    receipt.passed = false;
    persistReceipt(receipt);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runInstalledTwelveFx(options);
    process.stdout.write(`${JSON.stringify({
      receiptPath: result.receiptPath,
      mode: result.receipt.mode,
      archiveSHA256: result.receipt.archiveSHA256,
      sourceSHA256: result.receipt.sourceSHA256,
      familyResults: result.receipt.familyResults.map(({ family, I, D, B, P, H }) => ({ family, I, D, B, P, H })),
      passed: result.receipt.passed,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
