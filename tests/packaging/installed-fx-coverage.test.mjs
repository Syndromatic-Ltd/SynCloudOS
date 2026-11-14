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
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { requiredFxFamilies } from "../../scripts/synware/sdk-package-manifest.mjs";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("SDK entries align cleanly with the 22-family manifest", () => {
  const entryFamilies = Object.keys(synWareSdkEntries)
    .filter(entry => /^fx\/[^/]+$/u.test(entry))
    .map(entry => entry.slice("fx/".length))
    .sort();
  assert.deepEqual(entryFamilies, [...requiredFxFamilies].sort());
  assert.equal(requiredFxFamilies.length, 22);
});

test("installed FX verification runner aligns with manifest and covers all families in deterministic and browser modes", async () => {
  const runner = await import("../../scripts/fx/check-installed-fx.mjs");

  assert.equal(typeof runner.assertScenarioFamilyCoverage, "function", "Runner must export assertScenarioFamilyCoverage.");
  assert.equal(typeof runner.assertCompleteFamilyMatrix, "function", "Runner must export assertCompleteFamilyMatrix.");
  assert.equal(typeof runner.assertModeReceiptComplete, "function", "Runner must export assertModeReceiptComplete.");
  assert.equal(typeof runner.createInitialFxReceipt, "function", "Runner must export createInitialFxReceipt.");

  assert.deepEqual(runner.FX_FAMILIES, requiredFxFamilies, "FX_FAMILIES must match the 22-family manifest.");

  assert.doesNotThrow(() => {
    runner.assertScenarioFamilyCoverage(runner.deterministicScenarios, requiredFxFamilies, "deterministic");
  });
  for (const scenario of runner.deterministicScenarios) {
    assert.ok(Array.isArray(scenario.families) && scenario.families.length > 0, `Deterministic scenario ${scenario.id} must declare covered families.`);
    assert.equal(existsSync(resolve(root, scenario.test)), true, `Missing deterministic scenario file: ${scenario.test}`);
  }

  assert.doesNotThrow(() => {
    runner.assertScenarioFamilyCoverage(runner.browserScenarios, requiredFxFamilies, "browser");
  });
  for (const scenario of runner.browserScenarios) {
    assert.ok(Array.isArray(scenario.families) && scenario.families.length > 0, `Browser scenario ${scenario.id} must declare covered families.`);
    assert.equal(existsSync(resolve(root, scenario.script)), true, `Missing browser scenario script: ${scenario.script}`);
  }
  assert.ok(
    runner.browserScenarios.some(scenario => scenario.useAggregateBase === true),
    "Browser scenarios must verify relocated aggregate --base routing.",
  );
});

test("installed FX verification exposes any missing family coverage in either mode or receipt", async () => {
  const runner = await import("../../scripts/fx/check-installed-fx.mjs");

  for (const omittedFamily of requiredFxFamilies) {
    const partialDeterministic = runner.deterministicScenarios
      .map(scenario => ({ ...scenario, families: scenario.families.filter(family => family !== omittedFamily) }))
      .filter(scenario => scenario.families.length > 0);
    assert.throws(
      () => runner.assertScenarioFamilyCoverage(partialDeterministic, requiredFxFamilies, "deterministic"),
      error => error instanceof Error && error.message.includes(omittedFamily),
      `Deterministic coverage check must expose omitted family ${omittedFamily}.`,
    );

    const partialBrowser = runner.browserScenarios
      .map(scenario => ({ ...scenario, families: scenario.families.filter(family => family !== omittedFamily) }))
      .filter(scenario => scenario.families.length > 0);
    assert.throws(
      () => runner.assertScenarioFamilyCoverage(partialBrowser, requiredFxFamilies, "browser"),
      error => error instanceof Error && error.message.includes(omittedFamily),
      `Browser coverage check must expose omitted family ${omittedFamily}.`,
    );
  }

  assert.throws(
    () => runner.assertScenarioFamilyCoverage(
      [...runner.deterministicScenarios, { id: "typo", test: "tests/runtime/fx/packed-crypto.test.ts", families: ["nonexistent-fx"] }],
      requiredFxFamilies,
      "deterministic",
    ),
    /nonexistent-fx/iu,
    "Coverage check must reject undeclared FX family names.",
  );

  const fakeManifest = {
    schemaVersion: 2,
    package: "@syndromatic/syncloudos",
    commit: "test",
    archiveSha256: "test",
    integrity: "test",
    source: { sha256: "test" },
    resources: { sha256: "test" },
    entries: Object.fromEntries(requiredFxFamilies.map(family => [`@syndromatic/syncloudos/fx/${family}`, { import: `fx/${family}.js`, types: `fx/${family}.d.ts` }])),
  };
  const deterministicReceipt = runner.createInitialFxReceipt({ manifest: fakeManifest, manifestPath: "test", mode: "deterministic" });
  assert.throws(
    () => runner.assertCompleteFamilyMatrix(deterministicReceipt.familyResults.slice(0, -1)),
    /familyResults|row/iu,
  );
  for (const row of deterministicReceipt.familyResults) {
    row.I = "passed";
    row.D = row.family === "xr" ? "not-run" : "passed";
  }
  assert.throws(
    () => runner.assertModeReceiptComplete(deterministicReceipt, "deterministic"),
    /xr/iu,
    "Deterministic mode receipt check must expose an unverified family.",
  );

  const browserReceipt = runner.createInitialFxReceipt({ manifest: fakeManifest, manifestPath: "test", mode: "browser", base: "/nested/product/" });
  for (const row of browserReceipt.familyResults) {
    row.I = "passed";
    row.B = row.family === "dispatch" ? "not-run" : "passed";
  }
  assert.throws(
    () => runner.assertModeReceiptComplete(browserReceipt, "browser"),
    /dispatch/iu,
    "Browser mode receipt check must expose an unverified family.",
  );
});
