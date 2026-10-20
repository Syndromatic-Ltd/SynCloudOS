/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import ts from "typescript";
import { assertExpectedDefaultExport, parseManifest } from "./manifest-source.mjs";
export { parseManifest } from "./manifest-source.mjs";
import {
  deriveSynWareManifest,
  isIntegrationFileName,
  isPreferencePaneFolderName,
  isWidgetFolderName,
} from "./project-derivation.mjs";


/** The nearest `package.json` above a project folder supplies the version every derived manifest uses. */
export function projectVersionFor(target) {
  for (let directory = resolve(target); ; directory = dirname(directory)) {
    const manifestPath = resolve(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (typeof manifest.version === "string" && manifest.version.trim()) return { root: directory, version: manifest.version };
      throw new TypeError(`${manifestPath} has no version; it becomes every application's manifest version.`);
    }
    if (dirname(directory) === directory) throw new TypeError(`No package.json above ${target}; it supplies the project version.`);
  }
}


/** The icon files an application folder supplies, as the resource paths a manifest names. */
function applicationResourceUrls(resourcesDirectory) {
  const urls = {};
  if (!existsSync(resourcesDirectory)) return urls;
  for (const entry of readdirSync(resourcesDirectory, { withFileTypes: true })) {
    if (entry.isFile() && /^AppIcon\.(?:svg|png)$/iu.test(entry.name)) urls[`./Resources/${entry.name}`] = entry.name;
  }
  return urls;
}

/** The complete manifest a folder derives, before any schema validation. */
export function deriveManifestForFolder(target) {
  const { version } = projectVersionFor(target);
  const infoPath = resolve(target, "Contents/Info.ts");
  const overrides = existsSync(infoPath) ? parseManifest(infoPath) : {};
  return deriveSynWareManifest({
    folderName: basename(resolve(target)),
    packageVersion: version,
    overrides,
    resourceUrls: applicationResourceUrls(resolve(target, "Contents/Resources")),
  });
}

const expectedDefaultExport = {
  application: "a React component or an NSEApplication subclass",
  preferencePane: "definePreferencePane(...)",
  widget: "defineWidget(...)",
  integration: "defineIntegration(...)",
};

/** Which folder kind a path declares, from its name alone. */
export function folderKind(target) {
  const name = basename(resolve(target));
  if (name.endsWith(".app")) return "application";
  if (isPreferencePaneFolderName(name)) return "preferencePane";
  if (isWidgetFolderName(name)) return "widget";
  if (isIntegrationFileName(name)) return "integration";
  return null;
}

/** The repository CLI, the installed developer MCP and the Vite plugin share this derivation. */
export function createSynWareValidator({ schema, allowedImports, dependencies = {} }) {
  const validateManifest = new Ajv2020({allErrors:true,strict:false}).compile(schema);
  const permitted = new Set(allowedImports);
  function validateImports(path) {
    const text = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const external = source.statements.filter(ts.isImportDeclaration).map(statement => statement.moduleSpecifier.text).filter(value => !value.startsWith("."));
    const unsupported = external.filter(value => {
      if (permitted.has(value)) return false;
      const name = value.startsWith("@") ? value.split("/").slice(0,2).join("/") : value.split("/")[0];
      return !["react","react-dom","framer-motion"].includes(name) || !dependencies[name];
    });
    if (unsupported.length) throw new TypeError(`The entry imports unsupported package(s): ${unsupported.join(", ")}.`);
    if (/\.\.\/.*src\//u.test(text) || /[A-Za-z]:\\/u.test(text)) throw new TypeError("The entry must not include source-tree or absolute local paths.");
  }
  function entryFor(target, kind) {
    if (kind === "application") return resolve(target, "Contents/index.tsx");
    if (kind === "integration") return target;
    return resolve(target, "index.tsx");
  }
  function validate(target) {
    const resolvedTarget = resolve(target);
    const kind = folderKind(resolvedTarget);
    const findings = [];
    if (kind === null) {
      findings.push({file:resolvedTarget,line:1,rule:"synware.structure",message:"A SynCloudOS project folder name ends in .app, .prefPane, .widget or .integration.ts."});
      return {directory:resolvedTarget,kind,id:null,manifest:null,ok:false,error:findings.map(finding => finding.message).join("; "),findings};
    }
    const entryPath = entryFor(resolvedTarget, kind);
    if (!existsSync(entryPath)) findings.push({file:entryPath,line:1,rule:"synware.structure",message:"Required SynCloudOS file is missing."});
    let manifest = null;
    if (kind === "application") {
      try {
        manifest = deriveManifestForFolder(resolvedTarget);
        if (!validateManifest(manifest)) for (const error of validateManifest.errors ?? []) findings.push({file:resolve(resolvedTarget,"Contents/Info.ts"),line:1,rule:"synware.manifest",message:(error.instancePath || "/") + " " + error.message});
      } catch (error) {
        findings.push({file:resolve(resolvedTarget,"Contents/Info.ts"),line:1,rule:"synware.manifest",message:error.message});
      }
    }
    if (existsSync(entryPath)) {
      try { validateImports(entryPath); }
      catch (error) { findings.push({file:entryPath,line:1,rule:"synware.imports",message:error.message}); }
      try {
        assertExpectedDefaultExport(entryPath, kind === "application" ? null : { preferencePane: "definePreferencePane", widget: "defineWidget", integration: "defineIntegration" }[kind], expectedDefaultExport[kind]);
      } catch (error) {
        findings.push({file:entryPath,line:1,rule:"synware.structure",message:error.message});
      }
    }
    return {directory:resolvedTarget,kind,id:manifest?.id ?? null,manifest,ok:findings.length === 0,error:findings.map(finding => finding.message).join("; ") || null,findings};
  }
  return {validate,validateDirectory:validate,validateImports};
}

/** Every project folder a directory contains, by kind. */
export function discoverProjectFolders(directory) {
  const resolvedDirectory = resolve(directory);
  if (!existsSync(resolvedDirectory)) return [];
  return readdirSync(resolvedDirectory, { withFileTypes: true })
    .filter((entry) => (entry.isDirectory() || entry.isFile() && isIntegrationFileName(entry.name)) && folderKind(entry.name) !== null)
    .map((entry) => resolve(resolvedDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}
