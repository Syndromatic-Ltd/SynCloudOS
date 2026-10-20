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
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {
  createReadStream,
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { captureFontDeclaration, fontDeclarationCSS } from "../../src/NSE/Typography/fontDeclaration.mjs";
import { bundlePaths } from "./bundle-paths.mjs";
import { createApplicationToolchain } from "./application-toolchain.mjs";
import { createScosAppModuleSource } from "../../src/SynCloudOS/AppSDK/scos/appModuleSource.mjs";
import { assertExpectedDefaultExport, parseManifest } from "./manifest-source.mjs";
import validateManifest from "../../src/SynCloudOS/AppSDK/manifest/synappManifestValidator.generated.mjs";
import { normalizeBundleIdentifier } from "../../src/SynCloudOS/Identity/bundleIdentifier.mjs";
import {
  assertUniqueBundleIdentifiers,
  deriveSynWareManifest,
  integrationIdFromFileName,
  isIntegrationFileName,
  isPreferencePaneFolderName,
  isWidgetFolderName,
  parseApplicationSelection,
} from "./project-derivation.mjs";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  posix,
} from "node:path";

const projectModuleId = "virtual:syncloudos/project";
const appModulePrefix = "virtual:syncloudos/app/";
const resolvedProjectModuleId = `\0${projectModuleId}`;
const browserModuleId = "virtual:syncloudos/browser";
const resolvedBrowserModuleId = `\0${browserModuleId}`;
const typographyModuleId = "virtual:syncloudos/typography";
const resolvedTypographyModuleId = `\0${typographyModuleId}`;
const defaultAppsDirectory = "src/SynWare";
const defaultPreferencesDirectory = "src/Preferences";
const defaultWidgetsDirectory = "src/Widgets";
const defaultIntegrationsDirectory = "src/Integrations";
const defaultWebspringEntry = "src/Webspring/Contents/index.tsx";
const derivationModulePath = fileURLToPath(new URL("./project-derivation.mjs", import.meta.url));
const fontExtensions = new Set([".otf", ".ttf", ".woff", ".woff2"]);
const sourceExtensions = new Set([
  ".cjs",
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const packedAssetMime = Object.freeze({
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
});

function slash(value) {
  return value.replaceAll("\\", "/");
}

function caseKey(value) {
  return slash(value).toLowerCase();
}

function displayPath(value) {
  return slash(resolve(value));
}

function isPathInside(root, candidate) {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function assertNoSymlink(path, label) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw new Error(`SynCloudOS could not inspect ${label} at ${displayPath(path)}.`, { cause: error });
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`SynCloudOS Vite discovery rejects symbolic links in ${label}: ${displayPath(path)}.`);
  }
  return stat;
}

function assertDirectory(path, label) {
  const stat = assertNoSymlink(path, label);
  if (!stat.isDirectory()) throw new Error(`SynCloudOS expected ${label} to be a directory: ${displayPath(path)}.`);
  return realpathSync(path);
}

function assertFile(path, label, containingRoot) {
  const stat = assertNoSymlink(path, label);
  if (!stat.isFile()) throw new Error(`SynCloudOS expected ${label} to be a file: ${displayPath(path)}.`);
  const rootReal = realpathSync(containingRoot);
  const fileReal = realpathSync(path);
  if (!isPathInside(rootReal, fileReal)) {
    throw new Error(`SynCloudOS rejected a path escape from ${displayPath(containingRoot)}: ${displayPath(path)}.`);
  }
  return fileReal;
}

function readEntries(directory, label) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
  } catch (error) {
    throw new Error(`SynCloudOS could not enumerate ${label} at ${displayPath(directory)}.`, { cause: error });
  }
}

function assertUniqueCaseInsensitive(values, label) {
  const seen = new Map();
  for (const value of values) {
    const key = caseKey(value);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new Error(`SynCloudOS found a case collision in ${label}: ${previous} and ${value}.`);
    }
    seen.set(key, value);
  }
}

/** Every folder kind fails the build when its entry has no default export. */
function assertDefaultExport(path, label, expected) {
  try { assertExpectedDefaultExport(path, expected.match(/^(define\w+)\(/u)?.[1] ?? null, expected); }
  catch (cause) { throw new TypeError(`SynCloudOS expected ${label} to default-export ${expected}: ${cause.message}`, { cause }); }
}

function collectFiles(directory, label) {
  if (!existsSync(directory)) return [];
  assertDirectory(directory, label);
  const files = [];

  const visit = (currentDirectory) => {
    const entries = readEntries(currentDirectory, label);
    assertUniqueCaseInsensitive(entries.map((entry) => entry.name), label);
    for (const entry of entries) {
      const path = resolve(currentDirectory, entry.name);
      const stat = assertNoSymlink(path, `${label} entry`);
      if (stat.isDirectory()) {
        visit(path);
      } else if (stat.isFile()) {
        files.push(path);
      } else {
        throw new Error(`SynCloudOS expected ${label} to contain only files and directories: ${displayPath(path)}.`);
      }
    }
  };

  visit(directory);
  return files.sort((left, right) => {
    const leftRelative = slash(relative(directory, left));
    const rightRelative = slash(relative(directory, right));
    return leftRelative.localeCompare(rightRelative, "en");
  });
}

function relativeResourcePath(resourcesDirectory, file, label) {
  const value = slash(relative(resourcesDirectory, file));
  const segments = value.split("/");
  if (!value || value.startsWith("../") || value === ".." || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`SynCloudOS rejected a resource path escape in ${label}: ${displayPath(file)}.`);
  }
  return value;
}

function addResourceEntry(entries, key, file, label) {
  const collisionKey = caseKey(key);
  const previous = entries.seen.get(collisionKey);
  if (previous !== undefined) {
    throw new Error(`SynCloudOS found a duplicate or case-colliding resource key in ${label}: ${previous} and ${key}.`);
  }
  entries.seen.set(collisionKey, key);
  entries.values.push({ key, file });
}

function scanResources(resourcesDirectory, label) {
  const resourceUrls = { values: [], seen: new Map() };
  const localeResources = { values: [], seen: new Map() };
  const fontResourceUrls = { values: [], seen: new Map() };
  const files = collectFiles(resourcesDirectory, label);
  const pathKeys = new Map();

  for (const file of files) {
    const relativePath = relativeResourcePath(resourcesDirectory, file, label);
    const pathCollisionKey = caseKey(relativePath);
    const previousPath = pathKeys.get(pathCollisionKey);
    if (previousPath !== undefined) {
      throw new Error(`SynCloudOS found a duplicate or case-colliding resource path in ${label}: ${previousPath} and ${relativePath}.`);
    }
    pathKeys.set(pathCollisionKey, relativePath);

    const segments = relativePath.split("/");
    const extension = extname(relativePath).toLowerCase();
    const isLocalisedString = segments.length >= 3
      && /^(?:localised|localized)$/iu.test(segments[0])
      && /\.locale$/iu.test(segments[1])
      && extension === ".strings";
    if (isLocalisedString) {
      addResourceEntry(localeResources, segments.slice(1).join("/"), file, `${label} locale resources`);
    } else if (fontExtensions.has(extension)) {
      addResourceEntry(fontResourceUrls, `./Resources/${relativePath}`, file, `${label} font resources`);
    } else if (!sourceExtensions.has(extension)) {
      addResourceEntry(resourceUrls, `./Resources/${relativePath}`, file, `${label} resources`);
    }
  }

  return Object.freeze({
    resourceUrls: Object.freeze(resourceUrls.values),
    localeResources: Object.freeze(localeResources.values),
    fontResourceUrls: Object.freeze(fontResourceUrls.values),
    files: Object.freeze(files),
  });
}

function toViteFileImport(path) {
  const normalized = slash(resolve(path));
  return `/@fs/${normalized}`;
}

function quote(value) {
  return JSON.stringify(value);
}

function renderMap(entries, variableNames) {
  if (entries.length === 0) return "Object.freeze({})";
  return `Object.freeze({\n${entries.map(({ key }, index) => `    ${quote(key)}: ${variableNames[index]},`).join("\n")}\n  })`;
}

/** Locale files group by their `.locale` folder: `{ "Base.locale": { "Localisable.strings": source } }`, the shape LocaleServices registers. */
function renderLocaleResourceMap(entries, variableNames) {
  if (entries.length === 0) return "Object.freeze({})";
  const folders = new Map();
  entries.forEach(({ key }, index) => {
    const separator = key.indexOf("/");
    const folderName = separator === -1 ? key : key.slice(0, separator);
    const fileName = separator === -1 ? "" : key.slice(separator + 1);
    const files = folders.get(folderName) ?? [];
    files.push(`      ${quote(fileName)}: ${variableNames[index]},`);
    folders.set(folderName, files);
  });
  const rendered = [...folders].map(([folderName, files]) => `    ${quote(folderName)}: Object.freeze({\n${files.join("\n")}\n    }),`);
  return `Object.freeze({\n${rendered.join("\n")}\n  })`;
}

function renderSourceList(entries) {
  return `Object.freeze([${entries.map((entry) => quote(entry)).join(", ")}])`;
}

function generateProjectModule(discovery) {
  const imports = [];
  const body = [];
  const bundleExpressions = [];
  let importIndex = 0;

  const addUrlImports = (entries, query, prefix) => entries.map((entry) => {
    const variableName = `${prefix}${importIndex++}`;
    imports.push(`import ${variableName} from ${quote(`${toViteFileImport(entry.file)}?${query}`)};`);
    return variableName;
  });
  const addModuleImport = (path, prefix) => {
    const variableName = `${prefix}${importIndex++}`;
    imports.push(`import * as ${variableName} from ${quote(toViteFileImport(path))};`);
    return variableName;
  };

  imports.push(`import { selectProjectBundles, selectProjectIntegrations } from ${quote(toViteFileImport(derivationModulePath))};`);
  imports.push('import { createIntegrationContribution, integrationOwners, isDefinedWebspringWidget, isPreferencePaneDefinition, withDiscoveredWebspringItems } from "@syndromatic/syncloudos/webspring";');

  discovery.bundles.forEach((bundle) => {
    const resourceVariables = addUrlImports(bundle.resources.resourceUrls, "url", "resource");
    const localeVariables = addUrlImports(bundle.resources.localeResources, "raw", "locale");
    const fontVariables = addUrlImports(bundle.resources.fontResourceUrls, "url", "font");
    const resourceUrls = renderMap(bundle.resources.resourceUrls, resourceVariables);
    bundleExpressions.push(`  Object.freeze({
    manifest: Object.freeze(${quote(bundle.manifest)}),
    modulePath: ${quote(bundle.modulePath)},
    loadModule: () => import(${quote(toViteFileImport(bundle.entryPath))}),
    resourceUrls: ${resourceUrls},
    localeResources: ${renderLocaleResourceMap(bundle.resources.localeResources, localeVariables)},
    fontResourceUrls: ${renderMap(bundle.resources.fontResourceUrls, fontVariables)},
  })`);
  });

  const preferenceSources = discovery.preferences.map((pane) => {
    const variableName = addModuleImport(pane.entryPath, "preference");
    return `  { path: ${quote(pane.sourcePath)}, definition: ${variableName}.default }`;
  });
  const widgetSources = discovery.widgets.map((widget) => {
    const variableName = addModuleImport(widget.entryPath, "widget");
    return `  { path: ${quote(widget.sourcePath)}, definition: ${variableName}.default }`;
  });
  const integrationSources = discovery.integrations.map((integration) => {
    const variableName = addModuleImport(integration.entryPath, "integration");
    return `  { path: ${quote(integration.sourcePath)}, id: ${quote(integration.id)}, definition: ${variableName}.default, owners: integrationOwners(${variableName}.default, ${quote(integration.sourcePath)}) }`;
  });

  let shellExpression = "null";
  let shellResourcesExpression = "Object.freeze({ resourceUrls: Object.freeze({}), localeResources: Object.freeze({}), fontResourceUrls: Object.freeze({}) })";
  if (discovery.shell) {
    const shellModuleVariable = "shellModule";
    imports.push(`import * as ${shellModuleVariable} from ${quote(toViteFileImport(discovery.shell.entryPath))};`);
    const resourceVariables = addUrlImports(discovery.shell.resources.resourceUrls, "url", "shellResource");
    const localeVariables = addUrlImports(discovery.shell.resources.localeResources, "raw", "shellLocale");
    const fontVariables = addUrlImports(discovery.shell.resources.fontResourceUrls, "url", "shellFont");
    shellExpression = `${shellModuleVariable}.default ?? null`;
    shellResourcesExpression = `Object.freeze({\n  resourceUrls: ${renderMap(discovery.shell.resources.resourceUrls, resourceVariables)},\n  localeResources: ${renderLocaleResourceMap(discovery.shell.resources.localeResources, localeVariables)},\n  fontResourceUrls: ${renderMap(discovery.shell.resources.fontResourceUrls, fontVariables)},\n})`;
  }

  body.push(`export const shellResources = ${shellResourcesExpression};`);
  body.push(`const definedPreferences = [\n${preferenceSources.join(",\n")}\n];`);
  body.push(`export const preferences = Object.freeze(definedPreferences.map(({ path, definition }) => {
  if (!isPreferencePaneDefinition(definition)) throw new TypeError(\`\${path} must default-export definePreferencePane(...).\`);
  return definition;
}).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));`);
  body.push(`const definedWidgets = [\n${widgetSources.join(",\n")}\n];`);
  body.push(`export const widgets = Object.freeze(definedWidgets.map(({ path, definition }) => {
  if (!isDefinedWebspringWidget(definition)) throw new TypeError(\`\${path} must default-export defineWidget(...).\`);
  return definition;
}));`);
  body.push(`const shellDefinition = ${shellExpression};`);
  body.push("export const shell = shellDefinition === null ? null : withDiscoveredWebspringItems(shellDefinition, { preferences, widgets });");
  body.push(`const allBundles = Object.freeze([\n${bundleExpressions.join(",\n")}\n]);`);
  body.push("const applications = " + (discovery.applications === null ? "null" : renderSourceList(discovery.applications)) + ";");
  body.push("export const bundles = selectProjectBundles(allBundles, { applications, development: import.meta.env.DEV });");
  body.push(`const definedIntegrations = [\n${integrationSources.join(",\n")}\n];`);
  body.push("export const contributions = Object.freeze(selectProjectIntegrations(definedIntegrations, bundles.map(bundle => bundle.manifest.bundleIdentifier)).map(({ id, path, definition }) => createIntegrationContribution(definition, { id, source: path })));");

  return `${imports.join("\n")}\n\n${body.join("\n")}\n`;
}

function normaliseOptions(options) {
  if (options === undefined) return Object.freeze({});
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("synCloudOS options must be an object when provided.");
  }
  for (const key of ["appsDirectory", "preferencesDirectory", "widgetsDirectory", "integrationsDirectory", "webspringEntry"]) {
    const value = options[key];
    if (value === undefined) continue;
    if (key === "webspringEntry" && value === false) continue;
    if (typeof value !== "string") throw new TypeError(`synCloudOS options.${key} must be a string when provided.`);
    if (value.length === 0) throw new TypeError(`synCloudOS options.${key} must not be empty.`);
  }
  if (options.typography !== undefined && (typeof options.typography !== "string" || !options.typography)) throw new TypeError("synCloudOS options.typography must name a declaration module.");
  const applications = parseApplicationSelection(options.applications, "options.applications");
  return Object.freeze({
    appsDirectory: options.appsDirectory,
    preferencesDirectory: options.preferencesDirectory,
    widgetsDirectory: options.widgetsDirectory,
    integrationsDirectory: options.integrationsDirectory,
    webspringEntry: options.webspringEntry,
    typography: options.typography,
    applications,
  });
}


/** Direct child folders of one kind: `Billing.prefPane`, `Latest.widget`. */
function kindFolders(directory, matches, label, entryName, expected, options) {
  if (directory === null) return [];
  if (!existsSync(directory)) return [];
  assertDirectory(directory, label);
  const folders = [];
  for (const entry of readEntries(directory, label)) {
    if (!matches(entry.name)) continue;
    const path = resolve(directory, entry.name);
    const stat = assertNoSymlink(path, `${label} entry`);
    if (!stat.isDirectory()) throw new Error(`SynCloudOS expected ${label} entries to be directories: ${displayPath(path)}.`);
    const entryPath = resolve(path, entryName);
    assertFile(entryPath, `${entry.name} entry`, path);
    assertDefaultExport(entryPath, `${label}/${entry.name}/${entryName}`, expected);
    folders.push(Object.freeze({
      name: entry.name,
      entryPath,
      sourcePath: slash(relative(options.root, entryPath)),
    }));
  }
  return folders;
}

function discover(root, options) {
  const appsDirectory = resolve(root, options.appsDirectory ?? defaultAppsDirectory);
  if (existsSync(appsDirectory)) assertDirectory(appsDirectory, "the SynWare apps directory");
  const bundles = bundlePaths(root, options.appsDirectory ?? defaultAppsDirectory).map((appRoot) => {
    const name = posix.basename(slash(appRoot));
    assertDirectory(appRoot, `the ${name} app bundle`);
    const contentsDirectory = resolve(appRoot, "Contents");
    assertDirectory(contentsDirectory, `${name} Contents`);
    const infoPath = resolve(contentsDirectory, "Info.ts");
    const entryPath = resolve(contentsDirectory, "index.tsx");
    assertFile(infoPath, `${name}/Contents/Info.ts (required)`, appRoot);
    assertFile(entryPath, `${name} entry`, appRoot);
    assertDefaultExport(entryPath, `${name}/Contents/index.tsx`, "a React component or an NSEApplication subclass");
    const resourcesDirectory = resolve(contentsDirectory, "Resources");
    const resources = scanResources(resourcesDirectory, `${name} Resources`);
    const appRelative = slash(relative(appsDirectory, entryPath));
    const info = parseManifest(infoPath);
    const manifest = deriveSynWareManifest({ folderName: name, info, resourceUrls: Object.fromEntries(resources.resourceUrls.map(({ key, file }) => [key, file])) });
    if (!validateManifest(manifest)) throw new TypeError(`${name}/Contents/Info.ts resolves to an invalid manifest: ${validateManifest.errors.map(error => `${error.instancePath || "/"} ${error.message}`).join("; ")}`);
    return Object.freeze({
      name,
      bundleIdentifier: manifest.bundleIdentifier,
      manifest,
      infoPath,
      entryPath,
      modulePath: `./${appRelative}`,
      resources,
    });
  }).sort((left, right) => left.modulePath.localeCompare(right.modulePath, "en"));
  assertUniqueBundleIdentifiers(bundles);

  const preferences = kindFolders(
    options.preferencesDirectory === false ? null : resolve(root, options.preferencesDirectory ?? defaultPreferencesDirectory),
    isPreferencePaneFolderName,
    "the SynWare preference panes directory",
    "index.tsx",
    "definePreferencePane(...)",
    { root },
  );
  const widgets = kindFolders(
    options.widgetsDirectory === false ? null : resolve(root, options.widgetsDirectory ?? defaultWidgetsDirectory),
    isWidgetFolderName,
    "the SynWare widgets directory",
    "index.tsx",
    "defineWidget(...)",
    { root },
  );

  const integrationsDirectory = options.integrationsDirectory === false
    ? null
    : resolve(root, options.integrationsDirectory ?? defaultIntegrationsDirectory);
  const integrations = [];
  if (integrationsDirectory !== null && existsSync(integrationsDirectory)) {
    assertDirectory(integrationsDirectory, "the SynWare integrations directory");
    for (const entry of readEntries(integrationsDirectory, "the SynWare integrations directory")) {
      if (!isIntegrationFileName(entry.name)) continue;
      const path = resolve(integrationsDirectory, entry.name);
      assertFile(path, `${entry.name} integration`, integrationsDirectory);
      assertDefaultExport(path, `Integrations/${entry.name}`, "defineIntegration(...)");
      integrations.push(Object.freeze({
        name: entry.name,
        entryPath: path,
        sourcePath: slash(relative(root, path)),
        id: integrationIdFromFileName(entry.name),
      }));
    }
  }

  const watchRoots = [
    appsDirectory,
    root,
    ...bundles.flatMap((bundle) => [dirname(bundle.entryPath), dirname(dirname(bundle.entryPath))]),
    ...preferences.flatMap((pane) => [dirname(pane.entryPath), dirname(dirname(pane.entryPath))]),
    ...widgets.flatMap((widget) => [dirname(widget.entryPath), dirname(dirname(widget.entryPath))]),
    ...(integrationsDirectory === null ? [] : [integrationsDirectory]),
  ];
  let shell = null;
  if (options.webspringEntry !== false) {
    const shellEntry = resolve(root, options.webspringEntry ?? defaultWebspringEntry);
    const shellContents = dirname(shellEntry);
    if (existsSync(shellEntry)) {
      assertDirectory(shellContents, "the Webspring shell Contents directory");
      assertFile(shellEntry, "the Webspring shell entry", shellContents);
      assertDefaultExport(shellEntry, "the Webspring shell entry", "defineWebspring(...)");
      const shellResourcesDirectory = resolve(shellContents, "Resources");
      const resources = scanResources(shellResourcesDirectory, "Webspring shell Resources");
      shell = Object.freeze({ entryPath: shellEntry, resources });
      watchRoots.push(shellContents, shellResourcesDirectory);
    }
  }

  const envApplications = parseApplicationSelection(process.env.SYNCLOUDOS_APPLICATIONS, "SYNCLOUDOS_APPLICATIONS");
  const applications = options.applications ?? envApplications ?? null;

  const watchPaths = [
    ...watchRoots,
    ...bundles.flatMap((bundle) => [bundle.entryPath, ...(bundle.infoPath === null ? [] : [bundle.infoPath]), ...bundle.resources.files]),
    ...preferences.flatMap((pane) => [pane.entryPath]),
    ...widgets.flatMap((widget) => [widget.entryPath]),
    ...integrations.map((integration) => integration.entryPath),
    ...(shell ? [shell.entryPath, ...shell.resources.files] : []),
  ];
  const uniqueWatchRoots = [...new Set(watchRoots.map(displayPath))];
  const uniqueWatchPaths = [...new Set(watchPaths.map(displayPath))];
  assertUniqueCaseInsensitive(uniqueWatchRoots, "discovery watch roots");
  assertUniqueCaseInsensitive(uniqueWatchPaths, "discovery watch paths");
  const discovery = {
    applications,
    bundles,
    preferences,
    widgets,
    integrations,
    shell,
    watchRoots: Object.freeze(uniqueWatchRoots),
    watchPaths: Object.freeze(uniqueWatchPaths),
  };
  return Object.freeze({ ...discovery, code: generateProjectModule(discovery) });
}

function isWatchedFile(file, watchRoots) {
  return watchRoots.some((root) => isPathInside(root, file));
}

/**
 * The discovery the plugin, the static validator and the developer MCP share:
 * folders in, complete manifest bundles and contributions out.
 */
export function discoverSynWareProject(root, options = {}) {
  return discover(resolve(root), normaliseOptions(options));
}

function deploymentBasePath(base) {
  if (typeof base !== "string" || !base || base === "./") return "";
  try {
    const pathname = new URL(base, "http://syncloudos.invalid").pathname.replace(/\/+$/u, "");
    return pathname === "/" ? "" : pathname;
  } catch {
    return "";
  }
}

function mountPackedSdkAssets(devServer, root, base, cacheDir) {
  const assetRoot = resolve(root, "node_modules/@syndromatic/syncloudos/assets");
  if (!existsSync(assetRoot)) return;
  const serveAsset = (request, response, next) => {
    let name;
    try {
      name = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\/+/, "");
    } catch {
      return next();
    }
    if (!name || name.includes("/") || name.includes("\\")) return next();
    const extension = extname(name).toLowerCase();
    const mime = packedAssetMime[extension];
    if (!mime) return next();
    const path = resolve(assetRoot, name);
    if (!isPathInside(assetRoot, path) || !existsSync(path)) return next();
    response.setHeader("Content-Type", mime);
    createReadStream(path).pipe(response);
  };
  // Optimized modules live in <cacheDir>/deps and keep their ../assets URLs.
  // Use Vite's resolved location, including /@fs/ for caches outside the root.
  const cacheRoot = resolve(root, cacheDir ?? "node_modules/.vite");
  const cacheUrl = isPathInside(root, cacheRoot)
    ? `/${slash(relative(root, cacheRoot))}`
    : `/@fs/${slash(cacheRoot)}`;
  const optimizedAssetPath = `${cacheUrl.replace(/\/$/u, "")}/assets`;
  const basePath = deploymentBasePath(base);
  // A top-level entry (chronosphere.js) is optimized into deps/ itself and keeps its assets/ URLs.
  const optimizedEntryAssetPath = `${cacheUrl.replace(/\/$/u, "")}/deps/assets`;
  const mountPaths = new Set([optimizedAssetPath, `${basePath}${optimizedAssetPath}`, optimizedEntryAssetPath, `${basePath}${optimizedEntryAssetPath}`]);
  for (const mountPath of mountPaths) devServer.middlewares.use(mountPath, serveAsset);
}

export function synCloudOS(options) {
  const pluginOptions = normaliseOptions(options);
  let resolvedConfig = { root: resolve(process.cwd()) };
  let discovery = null;
  let server = null;
  let watcherCleanup = null;
  let typography = null;
  let typographyAssets = new Map();
  let typographyAssetPaths = new Map();

  const refreshTypography = async () => {
    if (!pluginOptions.typography) return;
    const entry = resolve(resolvedConfig.root, pluginOptions.typography);
    assertFile(entry, "typography declaration", resolvedConfig.root);
    const loaded = await loadConfigFromFile({ command: resolvedConfig.command ?? "serve", mode: resolvedConfig.mode ?? "development" }, entry, resolvedConfig.root);
    if (!loaded) throw new TypeError("Unable to load the typography declaration.");
    const declaration = captureFontDeclaration(loaded.config);
    const resources = Object.entries(declaration.resources).map(([id, path]) => {
      const file = resolve(dirname(entry), path); assertFile(file, `font resource ${id}`, dirname(entry));
      return { id, path, file };
    });
    typography = { entry, declaration, resources, watchPaths: [...loaded.dependencies.map(displayPath), displayPath(entry), ...resources.map(resource => displayPath(resource.file))] };
    server?.watcher.add(typography.watchPaths);
  };

  const typographyCode = () => {
    if (!typography) return "export const fontDeclaration = undefined; export const fontResourceUrls = Object.freeze({});";
    return `import fontDeclaration from ${quote(toViteFileImport(typography.entry))};\n` +
      typography.resources.map((resource, index) => `import font${index} from ${quote(`${toViteFileImport(resource.file)}?url`)};`).join("\n") +
      `\nexport { fontDeclaration };\nexport const fontResourceUrls = Object.freeze({${typography.resources.map((resource, index) => `${quote(resource.path)}:font${index}`).join(",")}});`;
  };

  const refresh = () => {
    discovery = discover(resolvedConfig.root, pluginOptions);
    return discovery;
  };

  const addWatchFiles = (context, paths) => {
    if (typeof context?.addWatchFile !== "function") return;
    for (const path of paths) context.addWatchFile(path);
  };

  const invalidateVirtualModule = () => {
    for (const id of [resolvedProjectModuleId, resolvedTypographyModuleId]) {
      const moduleNode = server?.moduleGraph?.getModuleById(id);
      if (moduleNode) server.moduleGraph.invalidateModule(moduleNode);
    }
    server?.ws?.send({ type: "full-reload", path: projectModuleId });
  };

  const sendWatcherError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    server?.ws?.send({
      type: "error",
      err: {
        message,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  };

  const refreshFromWatcher = (file) => {
    const current = discovery ?? refresh();
    if (!isWatchedFile(file, current.watchRoots)) return false;
    try {
      const next = refresh();
      server?.watcher.add(next.watchPaths);
      invalidateVirtualModule();
    } catch (error) {
      sendWatcherError(error);
    }
    return true;
  };

  // Standard decorators and hot reload of application modules (scripts/synware/application-toolchain.mjs).
  const toolchain = createApplicationToolchain();

  return {
    name: "syncloudos:project",
    enforce: "pre",
    config: toolchain.config,
    api: toolchain.api,
    transform: toolchain.transform,

    async configResolved(config) {
      resolvedConfig = config;
      refresh();
      await refreshTypography();
    },

    async buildStart() {
      const current = refresh();
      addWatchFiles(this, current.watchPaths);
      if (typography) {
        addWatchFiles(this, typography.watchPaths);
        if (resolvedConfig.command === "build") {
          typographyAssetPaths = new Map();
          typographyAssets = new Map(typography.resources.map(resource => [resource.id, this.emitFile({ type:"asset", name:resource.file.split(/[\\/]/u).at(-1), source:readFileSync(resource.file) })]));
        }
      }
    },

    resolveId(id, importer) {
      if (id === browserModuleId) return resolvedBrowserModuleId;
      if (id === "@syndromatic/syncloudos/browser" && importer !== resolvedBrowserModuleId) return resolvedBrowserModuleId;
      if (id.startsWith(appModulePrefix)) return `\0${id}`;
      if (id === "@syndromatic/syncloudos" && importer && !importer.startsWith("\0")) {
        const bundle = (discovery ?? refresh()).bundles.find(bundle => isPathInside(dirname(dirname(bundle.entryPath)), importer.split("?")[0]));
        if (bundle) return `\0${appModulePrefix}${normalizeBundleIdentifier(bundle.bundleIdentifier)}`;
      }
      return id === projectModuleId ? resolvedProjectModuleId : id === typographyModuleId ? resolvedTypographyModuleId : null;
    },

    load(id) {
      if (id.startsWith(`\0${appModulePrefix}`)) return createScosAppModuleSource(id.slice(appModulePrefix.length + 1));
      if (id === resolvedBrowserModuleId) return 'export * from "@syndromatic/syncloudos/browser";\nimport { mountSynCloudOS as mount } from "@syndromatic/syncloudos/browser";\nimport * as project from "virtual:syncloudos/project";\nexport function mountSynCloudOS(options) { return mount({ ...options, composition: options.composition ?? project }); }';
      if (id === resolvedTypographyModuleId) return typographyCode();
      if (id !== resolvedProjectModuleId) return null;
      return (discovery ?? refresh()).code;
    },

    configureServer(devServer) {
      watcherCleanup?.();
      server = devServer;
      mountPackedSdkAssets(devServer, resolvedConfig.root, resolvedConfig.base, resolvedConfig.cacheDir);
      const current = discovery ?? refresh();
      devServer.watcher.add(current.watchPaths);
      if (typography) devServer.watcher.add(typography.watchPaths);
      const watcher = devServer.watcher;
      const eventNames = ["add", "addDir", "unlink", "unlinkDir"];
      const listeners = eventNames.map((eventName) => {
        const listener = (file) => { refreshFromWatcher(file); };
        watcher.on(eventName, listener);
        return [eventName, listener];
      });
      let closed = false;
      watcherCleanup = () => {
        if (closed) return;
        closed = true;
        if (typeof watcher.off === "function") {
          for (const [eventName, listener] of listeners) watcher.off(eventName, listener);
        }
        watcherCleanup = null;
      };
      watcher.once?.("close", watcherCleanup);
      devServer.httpServer?.once("close", watcherCleanup);
    },

    async handleHotUpdate(context) {
      // An application module takes its own update; the project is unchanged.
      if (toolchain.acceptsHotUpdate(context)) return undefined;
      if (typography?.watchPaths.some(path => caseKey(path) === caseKey(displayPath(context.file)))) {
        await refreshTypography(); invalidateVirtualModule(); return [];
      }
      const current = discovery ?? refresh();
      if (!isWatchedFile(context.file, current.watchRoots)) return undefined;
      const next = refresh();
      server?.watcher.add(next.watchPaths);
      invalidateVirtualModule();
      return [];
    },

    generateBundle: {
      order: "pre",
      handler() {
        // Output names belong to this output's emitter, not buildStart's emitter.
        // Resolve them before Vite applies its post HTML transforms.
        typographyAssetPaths = new Map([...typographyAssets].map(([id, reference]) => [id, this.getFileName(reference)]));
      },
    },

    transformIndexHtml: {
      order: "post",
      handler(_html, context = {}) {
        if (!typography) return [];
        const base = resolvedConfig.base ?? "/";
        const urls = Object.fromEntries(typography.resources.map(resource => {
          const path = resolvedConfig.command === "build" ? typographyAssetPaths.get(resource.id) : slash(relative(resolvedConfig.root, resource.file)).split("/").map(encodeURIComponent).join("/");
          if (base === "./" || base === "") {
            const htmlPath = context.path ?? "/index.html";
            const directory = htmlPath.endsWith("/") ? htmlPath : posix.dirname(htmlPath);
            const relativePath = posix.relative(directory, `/${path}`);
            return [resource.id, relativePath.startsWith(".") ? relativePath : `./${relativePath}`];
          }
          return [resource.id, `${base.endsWith("/") ? base : `${base}/`}${path}`];
        }));
        return [
          ...typography.declaration.preloadResources.map(id => ({ tag:"link", attrs:{rel:"preload", as:"font", href:urls[id], type:packedAssetMime[extname(typography.declaration.resources[id]).toLowerCase()], crossorigin:"anonymous"}, injectTo:"head-prepend" })),
          { tag:"style", attrs:{"data-syncloudos-typography":""}, children:fontDeclarationCSS(typography.declaration, urls), injectTo:"head-prepend" },
        ];
      },
    },
  };
}
