#!/usr/bin/env node
/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { appkitCounterpartFor } from "../developer-mcp/lookup.mjs";

const SRC_EXTENSIONS = /\.(?:ts|tsx|mts|cts)$/u;
const NSE_DECLARATION = /^NSE[A-Z]/u;

// Rule 1 examples confirmed in the performance/lifecycle plan; uncertain names stay under Rule 3.
const PLAN_RULE_ONE_MAPS = Object.freeze({
  NSEScroller: "NSScroller",
  NSETableHeaderView: "NSTableHeaderView",
  NSEColourList: "NSColorList",
  NSEColourPicker: "NSColorPicker",
  NSEController: "NSController",
  NSEPreferencePane: "NSPreferencePane",
  NSEUUID: "NSUUID",
  NSEPersonNameComponents: "NSPersonNameComponents",
  NSETrackingOption: "NSTrackingArea.Options",
  NSEPopoverBehavior: "NSPopover.Behavior",
  NSECollectionLayoutItem: "NSCollectionLayoutItem",
  NSEAnimationTimingFunction: "CAMediaTimingFunction",
});

// Explicit Rule 3 renames named in Workstream F.
const PLAN_RULE_THREE_RENAMES = Object.freeze({
  NSEGroupedList: "GroupedRows",
  NSEGroupedListEdge: "GroupedRowsEdge",
  NSEGroupedListProps: "GroupedRowsProps",
  NSEListItem: "GroupedRow",
  NSEListItemProps: "GroupedRowProps",
});

function walkTypeScriptFiles(directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) walkTypeScriptFiles(fullPath, out);
    else if (SRC_EXTENSIONS.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(fullPath);
  }
  return out;
}

function declarationName(node) {
  if (
    (ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isVariableDeclaration(node)) &&
    node.name &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  return null;
}

function isExportedDeclaration(node) {
  const target = ts.isVariableDeclaration(node) ? node.parent?.parent : node;
  const flags = target ? ts.getCombinedModifierFlags(target) : ts.ModifierFlags.None;
  return Boolean(flags & ts.ModifierFlags.Export);
}

/** Collects every `NSE[A-Z]*` declaration across `src/` using the TypeScript AST. */
export function collectSrcNSEDeclarations(repositoryRoot = process.cwd()) {
  const root = resolve(repositoryRoot);
  const files = walkTypeScriptFiles(join(root, "src")).sort();
  const declarations = [];

  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2022, true);
    const relativePath = relative(root, filePath).replaceAll("\\", "/");

    function visit(node) {
      const name = declarationName(node);
      if (name && NSE_DECLARATION.test(name)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        declarations.push({
          name,
          file: relativePath,
          line: line + 1,
          exported: isExportedDeclaration(node),
        });
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return declarations;
}

/** Resolves a public or internal NSE declaration name against `appkit-counterparts.json`. */
export function internalAppkitCounterpartFor(name, map) {
  const publicMatch = appkitCounterpartFor(name, map);
  if (publicMatch !== undefined) return publicMatch;
  if (!map) return undefined;

  const internalMap = map.internalCounterparts ?? {};
  const suffixes = [...(map.derivedSuffixes ?? []), ...(map.internalDerivedSuffixes ?? [])];
  const suffixPattern = suffixes.length ? new RegExp(`(?:${suffixes.join("|")})$`, "u") : null;

  for (let base = name;;) {
    if (Object.hasOwn(internalMap, base)) return internalMap[base];
    if (Object.hasOwn(map.counterparts ?? {}, base)) return map.counterparts[base];
    if (!suffixPattern || !suffixPattern.test(base)) return undefined;
    base = base.replace(suffixPattern, "");
  }
}

function countIdentifierOccurrences(directories) {
  const counts = new Map();
  for (const directory of directories) {
    let files = [];
    try {
      files = walkTypeScriptFiles(directory);
    } catch {
      continue;
    }
    for (const filePath of files) {
      const tokens = readFileSync(filePath, "utf8").match(/\bNSE[A-Z][A-Za-z0-9_]*/gu);
      if (!tokens) continue;
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

function proposeDisposition(entry, map, tokenCounts) {
  const { name, exported } = entry;
  if (Object.hasOwn(PLAN_RULE_ONE_MAPS, name)) return `maps:${PLAN_RULE_ONE_MAPS[name]}`;
  if (Object.hasOwn(PLAN_RULE_THREE_RENAMES, name)) return `rename:${PLAN_RULE_THREE_RENAMES[name]}`;

  const suffixes = [...(map.derivedSuffixes ?? []), ...(map.internalDerivedSuffixes ?? [])];
  const suffixPattern = suffixes.length ? new RegExp(`(?:${suffixes.join("|")})$`, "u") : null;
  if (suffixPattern) {
    let base = name;
    while (suffixPattern.test(base)) {
      base = base.replace(suffixPattern, "");
      if (Object.hasOwn(PLAN_RULE_ONE_MAPS, base) || internalAppkitCounterpartFor(base, map) !== undefined) {
        return `derived:${base}`;
      }
    }
  }

  if (!exported && (tokenCounts.get(name) ?? 0) <= 1) return "remove";
  return `rename:${name.slice(3)}`;
}

/** Builds the inventory of internal `NSE*` declarations lacking an AppKit counterpart entry. */
export function buildInternalNSEInventory(repositoryRoot = process.cwd()) {
  const root = resolve(repositoryRoot);
  const map = JSON.parse(readFileSync(join(root, "docs/framework/appkit-counterparts.json"), "utf8"));
  const declarations = collectSrcNSEDeclarations(root);
  const tokenCounts = countIdentifierOccurrences([join(root, "src"), join(root, "tests"), join(root, "scripts")]);

  const byName = new Map();
  for (const entry of declarations) {
    if (internalAppkitCounterpartFor(entry.name, map) !== undefined) continue;
    if (!byName.has(entry.name)) byName.set(entry.name, entry);
  }

  const unmapped = [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => ({
      name: entry.name,
      file: entry.file,
      line: entry.line,
      disposition: proposeDisposition(entry, map, tokenCounts),
    }));

  return {
    totalDeclarationsInSrc: new Set(declarations.map(entry => entry.name)).size,
    unmappedCount: unmapped.length,
    unmapped,
  };
}

function main() {
  const args = process.argv.slice(2);
  const jsonIndex = args.indexOf("--json");
  const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
  const inventory = buildInternalNSEInventory(process.cwd());

  for (const item of inventory.unmapped) {
    console.log(`${item.name}\t${item.file}:${item.line}\t${item.disposition}`);
  }
  console.error(`Total unique NSE* declarations in src/: ${inventory.totalDeclarationsInSrc}; unmapped: ${inventory.unmappedCount}`);

  if (jsonPath) {
    const resolvedOut = resolve(jsonPath);
    mkdirSync(dirname(resolvedOut), { recursive: true });
    writeFileSync(resolvedOut, `${JSON.stringify(inventory, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
