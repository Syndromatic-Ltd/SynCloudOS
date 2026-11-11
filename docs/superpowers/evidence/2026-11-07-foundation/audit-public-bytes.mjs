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

// Re-run from the framework repository root after the final SDK entries settle.
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { synWareSdkEntries } from "../../../../scripts/synware/sdk-entries.mjs";

const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const programme = ts.createProgram([...new Set(Object.values(synWareSdkEntries).map(path => resolve(path))), ...parsed.fileNames], { ...parsed.options, noEmit: true });
const checker = programme.getTypeChecker();
const rows = new Map();
const raw = /\b(?:Uint8Array|ArrayBuffer|Blob)\b/u;
const local = declaration => relative(process.cwd(), declaration.getSourceFile().fileName).replaceAll("\\", "/").startsWith("src/");
const nameOf = symbol => checker.getFullyQualifiedName(symbol).replace(/"[^"]+"\./gu, "");
for (const [entry, path] of Object.entries(synWareSdkEntries)) {
  const seenSymbols = new Set(), seenTypes = new Set();
  function type(value) {
    if (!value || seenTypes.has(value)) return;
    seenTypes.add(value);
    if (value.isTypeParameter?.()) type(checker.getBaseConstraintOfType(value));
    if (value.aliasSymbol) symbol(value.aliasSymbol);
    if (value.symbol) symbol(value.symbol);
    if (value.types) value.types.forEach(type);
    if (value.aliasTypeArguments) value.aliasTypeArguments.forEach(type);
    if (value.objectFlags & ts.ObjectFlags.Reference) checker.getTypeArguments(value).forEach(type);
    const declarations = value.symbol?.declarations ?? [];
    if (declarations.length && !declarations.some(local)) return;
    for (const signature of [...value.getCallSignatures(), ...value.getConstructSignatures()]) {
      // A private constructor is emitted without its parameter types. Do not let
      // checker construct-signature traversal publish those host-only protocols.
      if (signature.declaration && ts.getCombinedModifierFlags(signature.declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
      signature.parameters.forEach(symbol); type(signature.getReturnType());
      signature.typeParameters?.forEach(type);
    }
    // Own public members and inline callback/record shapes are public API too.
    for (const property of value.getProperties()) symbol(property);
    for (const index of checker.getIndexInfosOfType(value)) type(index.type);
  }
  function symbol(value) {
    if (value.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
    if (seenSymbols.has(value)) return;
    seenSymbols.add(value);
    const declarations = value.declarations?.filter(local) ?? [];
    if (!declarations.length) return;
    for (const declaration of declarations) {
      const flags = ts.getCombinedModifierFlags(declaration);
      if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
      if (declaration.name && ts.isPrivateIdentifier(declaration.name)) continue;
      const file = declaration.getSourceFile();
      let signature = "";
      if (ts.isFunctionLike(declaration)) {
        const call = checker.getSignatureFromDeclaration(declaration);
        if (call) signature = checker.signatureToString(call, declaration, ts.TypeFormatFlags.NoTruncation);
      } else if (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration) || ts.isPropertyAssignment(declaration) || ts.isShorthandPropertyAssignment(declaration) || ts.isVariableDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration) || ts.isParameter(declaration)) {
        signature = declaration.type?.getText(file) ?? checker.typeToString(checker.getTypeOfSymbolAtLocation(value, declaration), declaration, ts.TypeFormatFlags.NoTruncation);
      }
      // Parameters are covered by their callable; named class/interface bodies by their members.
      if (signature && (raw.test(signature) || /\bNSEData(?:Convertible)?\b/u.test(signature)) && !ts.isParameter(declaration)) {
        const path = relative(process.cwd(), file.fileName).replaceAll("\\", "/");
        const line = file.getLineAndCharacterOfPosition(declaration.getStart(file)).line + 1;
        const name = nameOf(value);
        const key = `${path}:${declaration.pos}`;
        if (!rows.has(key)) rows.set(key, { path, line, name, signature: signature.replace(/\s+/gu, " "), entries: new Set() });
        rows.get(key).entries.add(entry);
      }
      if (ts.isClassDeclaration(declaration)) {
        type(checker.getTypeOfSymbolAtLocation(value, declaration));
        for (const member of declaration.members) {
          if (!ts.isConstructorDeclaration(member) || ts.getCombinedModifierFlags(member) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
          const call = checker.getSignatureFromDeclaration(member);
          const signature = call && checker.signatureToString(call, member, ts.TypeFormatFlags.NoTruncation);
          if (!signature || !(raw.test(signature) || /\bNSEData(?:Convertible)?\b/u.test(signature))) continue;
          const path = relative(process.cwd(), file.fileName).replaceAll("\\", "/");
          const line = file.getLineAndCharacterOfPosition(member.getStart(file)).line + 1;
          const key = `${path}:${member.pos}`;
          if (!rows.has(key)) rows.set(key, { path, line, name: nameOf(value) + ".constructor", signature, entries: new Set() });
          rows.get(key).entries.add(entry);
        }
      }
      if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) type(checker.getDeclaredTypeOfSymbol(value));
      else type(checker.getTypeOfSymbolAtLocation(value, declaration));
      // Preserve declared aliases even when checker normalises away a type argument.
      const nodes = ts.isFunctionLike(declaration) ? [declaration.type, ...declaration.parameters.map(p => p.type)] : [declaration.type];
      for (const node of nodes.filter(Boolean)) {
        const visit = child => { if (ts.isIdentifier(child)) { const referred = checker.getSymbolAtLocation(child); if (referred) symbol(referred); } ts.forEachChild(child, visit); }; visit(node);
      }
    }
  }
  const file = programme.getSourceFile(resolve(path));
  const module = file && checker.getSymbolAtLocation(file);
  if (module) checker.getExportsOfModule(module).forEach(symbol);
}
const result = [...rows.values()].sort((a,b) => a.path.localeCompare(b.path) || a.line-b.line).map(row => ({...row, entries:[...row.entries].sort()}));
const evidence = "docs/superpowers/evidence/2026-11-07-foundation/";
const exemptions = JSON.parse(readFileSync(evidence + "public-byte-carve-outs.json", "utf8"));
const remaining = result.filter(row => raw.test(row.signature)).map(row => {
  const exemption = exemptions.find(item => item.path === row.path && item.name === row.name && item.signature === row.signature);
  if (!exemption?.reason) throw new Error(`Undocumented public raw-byte signature: ${row.path}:${row.line} ${row.name} ${row.signature}`);
  return { ...row, carveOut: { category: exemption.category, reason: exemption.reason } };
});
for (const exemption of exemptions) {
  if (!remaining.some(row => row.path === exemption.path && row.name === exemption.name && row.signature === exemption.signature)) throw new Error(`Stale carve-out: ${exemption.path} ${exemption.name}`);
}
writeFileSync(evidence + "public-byte-signatures.json", JSON.stringify(remaining,null,2)+"\n");
const original = JSON.parse(readFileSync(evidence + "part-b-original-signatures.json", "utf8"));
const privateProtocols = new Set(["AUFXAudioRecorderEvent", "AUFXAudioRecorderPort.decode", "GFXPDFSnapshotObject", "BlockBacking.constructor", "BlockBacking.copyRange", "VFXPixelBacking.bytes"]);
const migrations = original.map(before => {
  const exemption = remaining.find(row => row.path === before.path && row.name === before.name && row.signature === before.signature);
  const hidden = privateProtocols.has(before.name) || (before.path.endsWith("AUFXAudioRecorder.ts") && before.name === "__type.data") || (before.path.endsWith("pdfDocumentProtocol.ts") && ["__type.bytes", "__type.encodedBytes"].includes(before.name));
  const after = result.filter(row => row.path === before.path && row.name === before.name).map(row => ({ line: row.line, signature: row.signature, entries: row.entries }));
  return { before, disposition: exemption ? "carve-out" : hidden ? "private-host-protocol" : "migrated", ...(exemption ? { reason: exemption.carveOut.reason } : {}), after };
});
writeFileSync(evidence + "part-b-migration-inventory.json", JSON.stringify(migrations,null,2)+"\n");
console.log(`${remaining.length} reachable raw signatures, all documented carve-outs; ${migrations.filter(row => row.disposition === "migrated").length} migrated; ${migrations.filter(row => row.disposition === "private-host-protocol").length} private host declarations.`);

const exports = {};
for (const entry of ["foundation", "fx/compression"]) {
  const file = programme.getSourceFile(resolve(synWareSdkEntries[entry]));
  const module = file && checker.getSymbolAtLocation(file);
  exports[entry] = checker.getExportsOfModule(module).map(symbol => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return { name: symbol.name, value: Boolean(target.flags & ts.SymbolFlags.Value), type: Boolean(target.flags & ts.SymbolFlags.Type) };
  }).sort((a,b) => a.name.localeCompare(b.name));
}
writeFileSync("docs/superpowers/evidence/2026-11-07-foundation/public-entry-exports.json", JSON.stringify(exports,null,2)+"\n");
