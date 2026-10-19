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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSynWareValidator, parseManifest } from "./validation-core.mjs";
export { parseManifest };
import { synWarePackageName, synWareSdkEntries, synWareSdkGeneratedStyles, synWareSdkStyles } from "./sdk-entries.mjs";
import { auditSynWareImports } from "./audit-sdk-imports.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const governedSynWareRoot = resolve(repositoryRoot, "src/SynWare");
const schema = JSON.parse(readFileSync(resolve(repositoryRoot, "src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json"), "utf8"));
const validator = createSynWareValidator({
  schema,
  allowedImports: [
    "react", "react/jsx-runtime", "react/jsx-dev-runtime",
    ...Object.keys(synWareSdkEntries).filter(entry => entry !== "sdk/testing").map(entry => `${synWarePackageName}/${entry}`),
    `${synWarePackageName}/nse/styles.css`,
    ...Object.keys(synWareSdkStyles).map(entry => `${synWarePackageName}/${entry}`),
    ...Object.keys(synWareSdkGeneratedStyles).map(entry => `${synWarePackageName}/${entry}`),
  ],
  dependencies: JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")).dependencies,
});
export const validateImports = validator.validateImports;

export function validateSynWareDirectory(targetArgument, boundaryAudit) {
  const target = resolve(targetArgument);
  const result = validator.validateDirectory(target);
  if (!result.ok) return result;
  try {
    if (target.startsWith(governedSynWareRoot + "/") || target.startsWith(governedSynWareRoot + "\\")) {
      const prefix = target.replaceAll("\\", "/") + "/";
      const violations = (boundaryAudit ?? auditSynWareImports(repositoryRoot)).internalImports.filter((violation) =>
        resolve(repositoryRoot, violation.file).replaceAll("\\", "/").startsWith(prefix));
      if (violations.length) throw new TypeError(violations.map((violation) => `${violation.location}: ${violation.reason}`).join("\n"));
    }
    return result;
  } catch (error) {
    return {
      directory: target,
      id: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function discoverSynWareDirectories(root = governedSynWareRoot) {
  const resolvedRoot = resolve(root);
  if (!existsSync(resolvedRoot)) return [];
  return readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => resolve(resolvedRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function resultSortKey(result) {
  return result.id ?? basename(result.directory);
}

export function validateSynWareDirectories(root = governedSynWareRoot) {
  const boundaryAudit = resolve(root) === governedSynWareRoot ? auditSynWareImports(repositoryRoot) : undefined;
  const results = discoverSynWareDirectories(root)
    .map((directory) => validateSynWareDirectory(directory, boundaryAudit))
    .sort((left, right) => resultSortKey(left).localeCompare(resultSortKey(right)));
  const valid = results.filter((result) => result.ok).length;
  const invalid = results.length - valid;
  return { root: resolve(root), results, valid, invalid, ok: invalid === 0 };
}

function writeResult(result, stdout, stderr, aggregate) {
  if (result.ok) {
    stdout.write(`validated ${result.id}\n`);
    return;
  }
  const prefix = aggregate ? `invalid ${basename(result.directory)}: ` : "";
  stderr.write(`${prefix}${result.error}\n`);
}

export function main(arguments_ = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const [targetArgument] = arguments_;
  if (targetArgument) {
    const result = validateSynWareDirectory(targetArgument);
    writeResult(result, stdout, stderr, false);
    return result.ok ? 0 : 1;
  }

  if (!existsSync(governedSynWareRoot)) {
    stderr.write("usage: validate-synware.mjs <SynWare app or directory of apps>\nThis repository has no src/SynWare of its own to validate.\n");
    return 2;
  }
  const aggregate = validateSynWareDirectories();
  for (const result of aggregate.results) writeResult(result, stdout, stderr, true);
  stdout.write(`summary: ${aggregate.valid} valid, ${aggregate.invalid} invalid\n`);
  return aggregate.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
