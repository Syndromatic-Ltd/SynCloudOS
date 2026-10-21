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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const textExtensions = new Set([".css", ".html", ".json", ".js", ".cjs", ".mjs", ".md", ".mts", ".ts", ".tsx", ".yaml", ".yml"]);
const deliveryPrefix = ["p", "p"].join("");
const separator = "[._\\-\\s]*";
const deliveryNumber = `${deliveryPrefix}${separator}0[0-4](?![0-9])`;
const standaloneDeliveryPrefix = `${deliveryPrefix}(?![A-Za-z0-9])`;
const camelCaseDeliveryPrefix = `${deliveryPrefix[0].toUpperCase()}${deliveryPrefix[1]}`;
const upperCaseDeliveryPrefix = deliveryPrefix.toUpperCase();
const privatePhrases = [
  ["post", "parity"].join("[-\\s]"),
  ["capability", "parity", "project"].join("[-\\s]"),
  ["record", `${deliveryPrefix}03`, "Abort"].join(""),
  ["__", `${deliveryPrefix}03`, "AbortTrace"].join(""),
];
const privateIdentifierPattern = new RegExp(
  `(?<![A-Za-z0-9])(?:${deliveryNumber}|${standaloneDeliveryPrefix}|${privatePhrases.join("|")})`,
  "gi",
);
const camelCaseNumberedIdentifierPattern = new RegExp(
  `(?<=[a-z])(?:${camelCaseDeliveryPrefix}|${upperCaseDeliveryPrefix})${separator}0[0-4](?![0-9])`,
  "g",
);

// Names of products and projects SynCloudOS must not ship or describe itself
// by. Assembled at runtime so this file does not flag itself.
const retiredNames = [
  ["Cappu", "ccino"], ["Ari", "sto"], ["Objective", "-J"], ["web", "OS"], ["En", "yo"],
  ["i", "Cloud"], ["Co", "dex"], ["Cla", "ude"],
].map((parts) => parts.join(""));
const retiredNamePattern = new RegExp(
  `(?<![A-Za-z0-9])(?:${retiredNames.map((name) => name.replace("-", "\\-")).join("|")})(?![A-Za-z0-9])|(?<![A-Za-z0-9]|Syn)${["Cloud", "OS"].join("")}(?![A-Za-z0-9])`,
  "gi",
);
// Public, shipped surfaces: framework source, its public documentation and
// (when built) the package archive contents.
const retiredNameRoots = ["src", "docs/framework", "README.md", ".artifacts/synapp-sdk/packages/syncloudos"];

function surfaceRoots(root) {
  const named = ["src", "tests", "scripts"]
    .map((entry) => resolve(root, entry))
    .filter((entry) => {
      try { return statSync(entry).isDirectory(); }
      catch { return false; }
    });
  const rootFiles = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (
      entry.name === ".gitignore" ||
      entry.name === "package.json" ||
      entry.name === "package-lock.json" ||
      /(?:^|[.-])config\.[cm]?[jt]s$/u.test(entry.name)
    ))
    .map((entry) => resolve(root, entry.name));
  return { named, rootFiles };
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return entry.isFile() ? [path] : [];
  });
}

function matches(value) {
  privateIdentifierPattern.lastIndex = 0;
  camelCaseNumberedIdentifierPattern.lastIndex = 0;
  return [
    ...value.matchAll(privateIdentifierPattern),
    ...value.matchAll(camelCaseNumberedIdentifierPattern),
  ]
    .map((match) => ({ token: match[0], index: match.index ?? 0 }))
    .sort((left, right) => left.index - right.index);
}

function diagnostic(path, line, column, token, kind) {
  return `${path}:${line}:${column}: ${kind}: ${token}`;
}

export function scanProductNameHygiene(root = repositoryRoot) {
  const { named, rootFiles } = surfaceRoots(root);
  const files = [...new Set([...named.flatMap(filesUnder), ...rootFiles])].sort();
  const diagnostics = [];
  for (const file of files) {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    for (const match of matches(relativePath)) {
      diagnostics.push(diagnostic(relativePath, 0, match.index + 1, match.token, "filename"));
    }
    if (!textExtensions.has(extname(file).toLowerCase()) && relativePath !== ".gitignore") continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/u);
    lines.forEach((line, lineIndex) => {
      for (const match of matches(line)) {
        diagnostics.push(diagnostic(relativePath, lineIndex + 1, match.index + 1, match.token, "content"));
      }
    });
  }
  return diagnostics.sort((left, right) => left.localeCompare(right));
}

function retiredNameFiles(root) {
  return retiredNameRoots.flatMap((entry) => {
    const path = resolve(root, entry);
    try {
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    } catch {
      return [];
    }
  });
}

/** Reports retired product names in shipped sources, public docs and the built package. */
export function scanRetiredProductNames(root = repositoryRoot) {
  const diagnostics = [];
  for (const file of [...new Set(retiredNameFiles(root))].sort()) {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    // Required upstream attribution names are legal notices, not product names.
    if (/^\.artifacts\/synapp-sdk\/packages\/syncloudos\/(?:THIRD_PARTY|ARTWORK)\.md$/u.test(relativePath)) continue;
    if (/^(?:src\/Themes|\.artifacts\/synapp-sdk\/packages\/syncloudos\/(?:dist\/)?themes)\/Atmo\.scostheme\/Contents\/Licences\/(?:THIRD_PARTY|ARTWORK)\.md$/u.test(relativePath)) continue;
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    readFileSync(file, "utf8").split(/\r?\n/u).forEach((line, lineIndex) => {
      retiredNamePattern.lastIndex = 0;
      for (const match of line.matchAll(retiredNamePattern)) {
        diagnostics.push(diagnostic(relativePath, lineIndex + 1, (match.index ?? 0) + 1, match[0], "retired-name"));
      }
    });
  }
  return diagnostics.sort((left, right) => left.localeCompare(right));
}

export function main({ root = repositoryRoot, stdout = console.log, stderr = console.error } = {}) {
  const diagnostics = [...scanProductNameHygiene(root), ...scanRetiredProductNames(root)];
  if (diagnostics.length > 0) {
    stderr(`Product-name hygiene failed: ${diagnostics.length} private identifier${diagnostics.length === 1 ? "" : "s"}.`);
    diagnostics.forEach((entry) => stderr(entry));
    return 1;
  }
  stdout("Product-name hygiene passed: no private identifiers or retired product names.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
