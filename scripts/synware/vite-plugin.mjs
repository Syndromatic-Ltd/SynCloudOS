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

import {
  createReadStream,
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { loadConfigFromFile } from "vite";
import { captureFontDeclaration, fontDeclarationCSS } from "../../src/NSE/Typography/fontDeclaration.mjs";
import { bundlePaths } from "./bundle-paths.mjs";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  posix,
} from "node:path";

const virtualModuleId = "virtual:syncloudos/composition";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;
const typographyModuleId = "virtual:syncloudos/typography";
const resolvedTypographyModuleId = `\0${typographyModuleId}`;
const defaultAppsDirectory = "src/SynWare";
const defaultWebspringEntry = "src/Webspring/Contents/index.tsx";
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

function generateVirtualModule(discovery) {
  const imports = [];
  const body = [];
  const bundleExpressions = [];
  let importIndex = 0;

  const addUrlImports = (entries, query, prefix) => entries.map((entry) => {
    const variableName = `${prefix}${importIndex++}`;
    imports.push(`import ${variableName} from ${quote(`${toViteFileImport(entry.file)}?${query}`)};`);
    return variableName;
  });

  discovery.bundles.forEach((bundle, bundleIndex) => {
    const manifestVariable = `manifestModule${bundleIndex}`;
    imports.push(`import * as ${manifestVariable} from ${quote(toViteFileImport(bundle.infoPath))};`);
    const resourceVariables = addUrlImports(bundle.resources.resourceUrls, "url", "resource");
    const localeVariables = addUrlImports(bundle.resources.localeResources, "raw", "locale");
    const fontVariables = addUrlImports(bundle.resources.fontResourceUrls, "url", "font");
    bundleExpressions.push(`  Object.freeze({\n    manifest: ${manifestVariable},\n    modulePath: ${quote(bundle.modulePath)},\n    loadModule: () => import(${quote(toViteFileImport(bundle.entryPath))}),\n    resourceUrls: ${renderMap(bundle.resources.resourceUrls, resourceVariables)},\n    localeResources: ${renderMap(bundle.resources.localeResources, localeVariables)},\n    fontResourceUrls: ${renderMap(bundle.resources.fontResourceUrls, fontVariables)},\n  })`);
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
    shellResourcesExpression = `Object.freeze({\n  resourceUrls: ${renderMap(discovery.shell.resources.resourceUrls, resourceVariables)},\n  localeResources: ${renderMap(discovery.shell.resources.localeResources, localeVariables)},\n  fontResourceUrls: ${renderMap(discovery.shell.resources.fontResourceUrls, fontVariables)},\n})`;
  }

  body.push(`export const bundles = Object.freeze([\n${bundleExpressions.join(",\n")}\n]);`);
  body.push(`export const shell = ${shellExpression};`);
  body.push(`export const shellResources = ${shellResourcesExpression};`);

  return `${imports.join("\n")}\n\n${body.join("\n")}\n`;
}

function normaliseOptions(options) {
  if (options === undefined) return Object.freeze({});
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("synCloudOS options must be an object when provided.");
  }
  if (options.appsDirectory !== undefined && typeof options.appsDirectory !== "string") {
    throw new TypeError("synCloudOS options.appsDirectory must be a string when provided.");
  }
  if (options.webspringEntry !== undefined && options.webspringEntry !== false && typeof options.webspringEntry !== "string") {
    throw new TypeError("synCloudOS options.webspringEntry must be a string or false when provided.");
  }
  if (typeof options.appsDirectory === "string" && options.appsDirectory.length === 0) {
    throw new TypeError("synCloudOS options.appsDirectory must not be empty.");
  }
  if (typeof options.webspringEntry === "string" && options.webspringEntry.length === 0) {
    throw new TypeError("synCloudOS options.webspringEntry must not be empty.");
  }
  if (options.typography !== undefined && (typeof options.typography !== "string" || !options.typography)) throw new TypeError("synCloudOS options.typography must name a declaration module.");
  return Object.freeze({
    appsDirectory: options.appsDirectory,
    webspringEntry: options.webspringEntry,
    typography: options.typography,
  });
}

function discover(root, options) {
  const appsDirectory = resolve(root, options.appsDirectory ?? defaultAppsDirectory);
  assertDirectory(appsDirectory, "the SynWare apps directory");
  const bundles = bundlePaths(root, options.appsDirectory ?? defaultAppsDirectory).map((appRoot) => {
    const appEntry = { name: posix.basename(slash(appRoot)) };
    assertDirectory(appRoot, `the ${appEntry.name} app bundle`);
    const contentsDirectory = resolve(appRoot, "Contents");
    assertDirectory(contentsDirectory, `${appEntry.name} Contents`);
    const infoPath = resolve(contentsDirectory, "Info.ts");
    const entryPath = resolve(contentsDirectory, "index.tsx");
    assertFile(infoPath, `${appEntry.name} Info.ts`, appRoot);
    assertFile(entryPath, `${appEntry.name} entry`, appRoot);
    const resourcesDirectory = resolve(contentsDirectory, "Resources");
    const resources = scanResources(resourcesDirectory, `${appEntry.name} Resources`);
    return Object.freeze({
      infoPath,
      entryPath,
      modulePath: `./${slash(relative(appsDirectory, entryPath))}`,
      resources,
    });
  }).sort((left, right) => left.modulePath.localeCompare(right.modulePath, "en"));

  const watchRoots = [appsDirectory, ...bundles.flatMap((bundle) => [dirname(bundle.infoPath), dirname(bundle.entryPath), dirname(dirname(bundle.entryPath))])];
  let shell = null;
  if (options.webspringEntry !== false) {
    const shellEntry = resolve(root, options.webspringEntry ?? defaultWebspringEntry);
    const shellContents = dirname(shellEntry);
    assertDirectory(shellContents, "the Webspring shell Contents directory");
    assertFile(shellEntry, "the Webspring shell entry", shellContents);
    const shellResourcesDirectory = resolve(shellContents, "Resources");
    const resources = scanResources(shellResourcesDirectory, "Webspring shell Resources");
    shell = Object.freeze({
      entryPath: shellEntry,
      resources,
    });
    watchRoots.push(shellContents, shellResourcesDirectory);
  }

  const watchPaths = [
    ...watchRoots,
    ...bundles.flatMap((bundle) => [bundle.infoPath, bundle.entryPath, ...bundle.resources.files]),
    ...(shell ? [shell.entryPath, ...shell.resources.files] : []),
  ];
  const uniqueWatchRoots = [...new Set(watchRoots.map(displayPath))];
  const uniqueWatchPaths = [...new Set(watchPaths.map(displayPath))];
  assertUniqueCaseInsensitive(uniqueWatchRoots, "discovery watch roots");
  assertUniqueCaseInsensitive(uniqueWatchPaths, "discovery watch paths");
  return Object.freeze({
    bundles: Object.freeze(bundles),
    shell,
    watchRoots: Object.freeze(uniqueWatchRoots),
    watchPaths: Object.freeze(uniqueWatchPaths),
    code: generateVirtualModule({ bundles, shell }),
  });
}

function isWatchedFile(file, watchRoots) {
  return watchRoots.some((root) => isPathInside(root, file));
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
    for (const id of [resolvedVirtualModuleId, resolvedTypographyModuleId]) {
      const moduleNode = server?.moduleGraph?.getModuleById(id);
      if (moduleNode) server.moduleGraph.invalidateModule(moduleNode);
    }
    server?.ws?.send({ type: "full-reload", path: virtualModuleId });
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

  return {
    name: "syncloudos:composition",
    enforce: "pre",

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

    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : id === typographyModuleId ? resolvedTypographyModuleId : null;
    },

    load(id) {
      if (id === resolvedTypographyModuleId) return typographyCode();
      if (id !== resolvedVirtualModuleId) return null;
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
