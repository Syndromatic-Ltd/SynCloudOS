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

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  posix,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { readContainedRepositoryText } from "./lib/repository-paths.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const POLICY_PATH = "scripts/quality/architecture-boundaries.json";
const GLOB_META = /[*?[\]{}<>]/;
const ORDINAL = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const SUPPORTED_GLOB_EXTENSIONS = new Set([
  ".avif",
  ".cjs",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".json5",
  ".jsx",
  ".less",
  ".mjs",
  ".mp3",
  ".mp4",
  ".otf",
  ".png",
  ".sass",
  ".scss",
  ".strings",
  ".svg",
  ".txt",
  ".ts",
  ".tsx",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);
const REPOSITORY_EXCLUSION_GLOBS = [
  "-g",
  "!.git/**",
  "-g",
  "!node_modules/**",
  "-g",
  "!dist/**",
  "-g",
  "!build/**",
  "-g",
  "!coverage/**",
  "-g",
  "!.artifacts/**",
];

function addError(errors, message) {
  if (!errors.includes(message)) errors.push(message);
}

function repoPath(root, absolute) {
  return relative(root, absolute).replaceAll("\\", "/");
}

function patternMatches(path, pattern) {
  if (typeof pattern !== "string") return false;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

function patternSpecificity(pattern) {
  return pattern.endsWith("/**")
    ? pattern.slice(0, -3).length
    : 100_000 + pattern.length;
}

function classification(path, layers) {
  const matches = [];
  for (const layer of Array.isArray(layers) ? layers : []) {
    if (!layer || !Array.isArray(layer.include)) continue;
    for (const pattern of layer.include) {
      if (patternMatches(path, pattern)) {
        matches.push({
          layer,
          pattern,
          specificity: patternSpecificity(pattern),
        });
      }
    }
  }
  if (matches.length === 0) {
    return { layer: null, ambiguous: [] };
  }
  const maximum = Math.max(...matches.map(({ specificity }) => specificity));
  const winners = matches.filter(({ specificity }) => specificity === maximum);
  const layersById = new Map(winners.map(({ layer }) => [layer.id, layer]));
  if (layersById.size !== 1) {
    return {
      layer: null,
      ambiguous: [...layersById.values()].sort((left, right) =>
        ORDINAL(left.id, right.id),
      ),
    };
  }
  return { layer: [...layersById.values()][0], ambiguous: [] };
}

function classify(path, layers) {
  return classification(path, layers).layer;
}

function runRg(root, args, runner, label) {
  if (typeof root !== "string" || typeof runner !== "function") {
    throw new Error(`rg ${label} discovery received malformed arguments`);
  }
  let output;
  try {
    output = runner("rg", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error?.status === 1) {
      throw new Error(`rg ${label} discovery returned no files`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`rg ${label} discovery failed: ${message}`);
  }
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : String(output ?? "");
  const paths = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"));
  if (paths.length === 0) {
    throw new Error(`rg ${label} discovery returned no files`);
  }
  return paths;
}

export function discoverTypeScriptFiles(root, runner = execFileSync) {
  return runRg(
    root,
    [
      "--files",
      "--hidden",
      "--no-ignore",
      ...REPOSITORY_EXCLUSION_GLOBS,
      "-g",
      "*.ts",
      "-g",
      "*.tsx",
    ],
    runner,
    "TypeScript",
  ).sort(ORDINAL);
}

export function discoverRepositoryFiles(root, runner = execFileSync) {
  return new Set(
    runRg(
      root,
      ["--files", "--hidden", "--no-ignore", ...REPOSITORY_EXCLUSION_GLOBS],
      runner,
      "repository",
    ),
  );
}

function loadCompilerOptions(root) {
  const candidates = ["tsconfig.app.json", "tsconfig.json"];
  for (const candidate of candidates) {
    const path = resolve(root, candidate);
    if (!existsSync(path)) continue;
    const read = ts.readConfigFile(path, ts.sys.readFile);
    if (read.error) continue;
    return ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      dirname(path),
      undefined,
      path,
    ).options;
  }
  return {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: false,
  };
}

function loadTsconfigAliases(root) {
  const aliases = [];
  for (const candidate of ["tsconfig.app.json", "tsconfig.json", "tsconfig.node.json"]) {
    const path = resolve(root, candidate);
    if (!existsSync(path)) continue;
    let config;
    try {
      config = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    const compilerOptions =
      config && typeof config.compilerOptions === "object"
        ? config.compilerOptions
        : {};
    const baseUrl =
      typeof compilerOptions.baseUrl === "string"
        ? resolve(dirname(path), compilerOptions.baseUrl)
        : dirname(path);
    const paths = compilerOptions.paths;
    if (!paths || typeof paths !== "object" || Array.isArray(paths)) continue;
    for (const [rawFind, rawTargets] of Object.entries(paths)) {
      const wildcard = rawFind.endsWith("/*");
      const find = rawFind.replace(/\/\*$/, "");
      if (!Array.isArray(rawTargets)) continue;
      for (const rawTarget of rawTargets) {
        if (typeof rawTarget !== "string") continue;
        aliases.push({
          find,
          replacement: resolve(baseUrl, rawTarget.replace(/\/\*$/, "")),
          source: candidate,
          wildcard,
        });
      }
    }
  }
  return aliases;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return null;
}

function staticAliasValue(node, root) {
  if (ts.isStringLiteralLike(node)) {
    return isAbsolute(node.text) ? node.text : resolve(root, node.text);
  }
  if (
    ts.isCallExpression(node) &&
    ["resolve", "join"].includes(propertyName(node.expression) ?? "") &&
    node.arguments.length > 0
  ) {
    const pieces = node.arguments
      .filter(ts.isStringLiteralLike)
      .map((argument) => argument.text);
    if (pieces.length > 0) return resolve(root, ...pieces);
  }
  return null;
}

function loadViteAliases(root) {
  const path = resolve(root, "vite.config.ts");
  if (!existsSync(path)) return [];
  let source;
  try {
    source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
  } catch {
    return [];
  }
  const aliases = [];
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === "alias"
    ) {
      if (ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const find = propertyName(property.name);
          const replacement = staticAliasValue(property.initializer, root);
          if (find && replacement) aliases.push({ find, replacement });
        }
      } else if (ts.isArrayLiteralExpression(node.initializer)) {
        for (const element of node.initializer.elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          let find = null;
          let replacement = null;
          for (const property of element.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const name = propertyName(property.name);
            if (name === "find" && ts.isStringLiteralLike(property.initializer)) {
              find = property.initializer.text;
            } else if (name === "replacement") {
              replacement = staticAliasValue(property.initializer, root);
            }
          }
          if (find && replacement) aliases.push({ find, replacement });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return aliases;
}

function relativeRealpath(root, candidate) {
  if (typeof candidate !== "string" || candidate.trim() === "") return null;
  const absolute = isAbsolute(candidate) ? candidate : resolve(root, candidate);
  let realRoot;
  let realCandidate;
  try {
    realRoot = realpathSync(root);
    realCandidate = realpathSync(absolute);
  } catch {
    return null;
  }
  const result = relative(realRoot, realCandidate).replaceAll("\\", "/");
  if (result === "" || (result !== ".." && !result.startsWith("../") && !isAbsolute(result))) {
    return result;
  }
  return null;
}

function allowsExactNestedAlias(configuredByFind, a, b) {
  const base = a.find.length <= b.find.length ? a : b;
  const nested = base === a ? b : a;
  if (!nested.find.startsWith(base.find + "/")) return false;
  const entries = [
    ...(configuredByFind.get(base.find) ?? []),
    ...(configuredByFind.get(nested.find) ?? []),
  ];
  return entries.length > 0 && entries.every(({ wildcard }) => wildcard !== true);
}

function validateConfiguredAliases(policy, root) {
  const errors = [];
  const configured = [
    ...loadTsconfigAliases(root),
    ...loadViteAliases(root).map((alias) => ({ ...alias, source: "vite.config.ts" })),
  ];
  const configuredByFind = new Map();
  for (const alias of configured) {
    const replacement = relativeRealpath(root, alias.replacement);
    if (!replacement) {
      addError(errors, `configured alias ${alias.find} replacement escapes or is absent`);
      continue;
    }
    const entries = configuredByFind.get(alias.find) ?? [];
    entries.push({ ...alias, replacement });
    configuredByFind.set(alias.find, entries);
  }
  for (const [find, entries] of configuredByFind) {
    if (new Set(entries.map(({ replacement }) => replacement)).size > 1) {
      addError(errors, `configured aliases conflict for ${find}`);
    }
  }
  const configuredFinds = [...configuredByFind.keys()];
  for (let left = 0; left < configuredFinds.length; left += 1) {
    for (let right = left + 1; right < configuredFinds.length; right += 1) {
      const a = configuredFinds[left];
      const b = configuredFinds[right];
      if (
        (a.startsWith(b + "/") || b.startsWith(a + "/")) &&
        !allowsExactNestedAlias(configuredByFind, { find: a }, { find: b })
      ) {
        addError(errors, `configured alias shadowing or conflict ${a} and ${b}`);
      }
    }
  }

  const policyAliases = Array.isArray(policy?.aliases) ? policy.aliases : [];
  const policyByFind = new Map();
  for (const alias of policyAliases) {
    if (!alias || typeof alias.find !== "string") continue;
    const replacement = relativeRealpath(root, alias.replacement);
    if (!replacement) {
      addError(errors, `boundary alias ${alias.find} replacement escapes the repository`);
    }
    const entries = policyByFind.get(alias.find) ?? [];
    entries.push({ alias, replacement });
    policyByFind.set(alias.find, entries);
  }
  const policyFinds = [...policyByFind.keys()];
  for (let left = 0; left < policyFinds.length; left += 1) {
    for (let right = left + 1; right < policyFinds.length; right += 1) {
      const a = policyFinds[left];
      const b = policyFinds[right];
      if (
        (a.startsWith(b + "/") || b.startsWith(a + "/")) &&
        !allowsExactNestedAlias(configuredByFind, { find: a }, { find: b })
      ) {
        addError(errors, `shadowing or conflicting boundary aliases ${a} and ${b}`);
      }
    }
  }
  for (const [find, entries] of policyByFind) {
    const policyReplacement = entries[0].replacement;
    const configuredEntries = configuredByFind.get(find) ?? [];
    if (configuredEntries.length === 0) {
      addError(errors, `unknown or conflicting boundary alias ${find}`);
      continue;
    }
    if (
      policyReplacement &&
      !configuredEntries.some(({ replacement }) => replacement === policyReplacement)
    ) {
      addError(errors, `conflicting boundary alias ${find} replacement ${policyReplacement}`);
    }
  }
  for (const [find, entries] of configuredByFind) {
    const replacement = entries[0]?.replacement;
    if (!policyByFind.has(find)) {
      addError(
        errors,
        `policy aliases are missing configured alias ${find} -> ${replacement}`,
      );
    }
  }
  return errors;
}

function applyAlias(specifier, aliases) {
  for (const alias of [...aliases].sort((left, right) => right.find.length - left.find.length)) {
    if (specifier === alias.find) return alias.replacement;
    if (specifier.startsWith(`${alias.find}/`)) {
      return `${alias.replacement}/${specifier.slice(alias.find.length + 1)}`;
    }
  }
  return specifier;
}

function resolveModule({
  root,
  sourcePath,
  specifier,
  compilerOptions,
  aliases,
}) {
  const rewritten = applyAlias(specifier, aliases);
  const result = ts.resolveModuleName(
    rewritten,
    resolve(root, sourcePath),
    compilerOptions,
    ts.sys,
  ).resolvedModule;
  let absolute = result?.resolvedFileName;
  if (!absolute && isAbsolute(rewritten)) {
    for (const candidate of [
      rewritten,
      `${rewritten}.ts`,
      `${rewritten}.tsx`,
      resolve(rewritten, "index.ts"),
      resolve(rewritten, "index.tsx"),
    ]) {
      if (existsSync(candidate)) {
        absolute = candidate;
        break;
      }
    }
  }
  if (!absolute) return null;
  const target = repoPath(root, resolve(absolute));
  return target;
}

function moduleSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    return node.argument.literal.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0]) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))
  ) {
    return node.arguments[0].text;
  }
  return null;
}

function loaderKind(node, sourceFile) {
  if (!ts.isCallExpression(node)) return null;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return "import";
  if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
    return "require";
  }
  const expression = node.expression.getText(sourceFile);
  if (
    expression === "import.meta.glob" ||
    expression === "import.meta.globEager"
  ) {
    return "import.meta.glob";
  }
  return null;
}

function globRegex(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        expression += ".*";
        index += 1;
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function globExtensions(specifier) {
  const extension = posix.extname(specifier).toLowerCase();
  const braceSet = /^\.\{([a-z0-9]+(?:,[a-z0-9]+)+)\}$/iu.exec(extension);
  return braceSet ? braceSet[1].split(",").map((value) => "." + value) : [extension];
}

function expandBracePattern(pattern) {
  const match = /\{([a-z0-9]+(?:,[a-z0-9]+)+)\}/iu.exec(pattern);
  if (!match) return pattern.includes("{") || pattern.includes("}") ? [] : [pattern];
  return match[1].split(",").map(
    (value) => pattern.slice(0, match.index) + value + pattern.slice(match.index + match[0].length),
  );
}

function resolveGlobTargets(sourcePath, specifier, files) {
  if (
    typeof sourcePath !== "string" ||
    typeof specifier !== "string" ||
    !specifier.startsWith(".")
  ) {
    return { targets: [], escaped: false, invalid: true, pattern: specifier };
  }
  const pattern = posix.normalize(
    posix.join(posix.dirname(sourcePath), specifier),
  );
  if (pattern.startsWith("../") || pattern === "..") {
    return { targets: [], escaped: true, invalid: false, pattern };
  }
  const matchers = expandBracePattern(pattern).map(globRegex);
  return {
    targets: [...(files instanceof Set ? files : Array.isArray(files) ? files : [])].filter(
      (path) => matchers.some((matcher) => matcher.test(path)),
    ),
    escaped: false,
    invalid: false,
    pattern,
  };
}

function isStaticGlobValue(node) {
  if (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((element) => !ts.isSpreadElement(element) && isStaticGlobValue(element));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        isStaticGlobValue(property.initializer),
    );
  }
  return false;
}

function extractEdges({
  root,
  files,
  repositoryFiles,
  layers,
  compilerOptions,
  aliases,
  isControlled,
}) {
  const edges = [];
  const errors = [];
  const addResolvedEdge = ({
    sourcePath,
    sourceLayer,
    target,
    line,
    loader = null,
  }) => {
    if (
      typeof target !== "string" ||
      target === ".." ||
      target.startsWith("../") ||
      isAbsolute(target)
    ) {
      addError(
        errors,
        `${sourcePath}:${line} resolves outside repository target ${String(target)}`,
      );
      return;
    }
    const targetClassification = classification(target, layers);
    if (targetClassification.ambiguous.length > 0) {
      addError(
        errors,
        `ambiguous boundary classification for ${target}: ${targetClassification.ambiguous
          .map(({ id }) => id)
          .join(", ")}`,
      );
      return;
    }
    if (!targetClassification.layer) {
      if (isControlled(target)) {
        addError(
          errors,
          `${sourcePath}:${line} resolves to unclassified controlled target ${target}`,
        );
      } else if (repositoryFiles.has(target)) {
        addError(
          errors,
          `${sourcePath}:${line} resolves to unclassified repository target ${target}`,
        );
      }
      return;
    }
    edges.push({
      source: sourcePath,
      target,
      line,
      loader,
      sourceLayer: sourceLayer.id,
      targetLayer: targetClassification.layer.id,
    });
  };

  for (const sourcePath of files) {
    const sourceLayer = classify(sourcePath, layers);
    if (!sourceLayer) continue;
    const absolute = resolve(root, sourcePath);
    const sourceFile = ts.createSourceFile(
      absolute,
      readFileSync(absolute, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node) {
      const kind = loaderKind(node, sourceFile);
      if (kind === "import" || kind === "require") {
        if (
          node.arguments.length !== 1 ||
          !ts.isStringLiteralLike(node.arguments[0])
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          addError(
            errors,
            `${sourcePath}:${line + 1} non-static ${kind} is forbidden`,
          );
        }
      } else if (kind === "import.meta.glob") {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        if (node.arguments.length < 1 || !ts.isStringLiteralLike(node.arguments[0])) {
          addError(
            errors,
            `${sourcePath}:${line + 1} non-static import.meta.glob is forbidden`,
          );
        } else if (
          node.arguments.length > 2 ||
          (node.arguments.length === 2 && !isStaticGlobValue(node.arguments[1]))
        ) {
          addError(
            errors,
            `${sourcePath}:${line + 1} import.meta.glob options must be a static supported object`,
          );
        } else {
          const specifier = node.arguments[0].text;
          const extensions = globExtensions(specifier);
          const extension = extensions.join(",");
          if (extensions.some((candidate) => !SUPPORTED_GLOB_EXTENSIONS.has(candidate))) {
            addError(
              errors,
              `${sourcePath}:${line + 1} import.meta.glob uses an unsupported asset type ${extension || "<none>"}`,
            );
          } else {
            const resolved = resolveGlobTargets(
              sourcePath,
              specifier,
              repositoryFiles,
            );
            if (resolved.invalid) {
              addError(
                errors,
                `${sourcePath}:${line + 1} import.meta.glob pattern must be a local repository path`,
              );
            } else if (resolved.escaped) {
              addError(
                errors,
                `${sourcePath}:${line + 1} import.meta.glob pattern escapes the repository`,
              );
            } else if (resolved.targets.length === 0) {
              addError(
                errors,
                `${sourcePath}:${line + 1} import.meta.glob resolves no repository assets`,
              );
            }
            for (const target of resolved.targets) {
              addResolvedEdge({
                sourcePath,
                sourceLayer,
                target,
                line: line + 1,
                loader: "import.meta.glob",
              });
            }
          }
        }
      }
      const specifier = moduleSpecifier(node);
      if (specifier) {
        const target = resolveModule({
          root,
          sourcePath,
          specifier,
          compilerOptions,
          aliases,
        });
        if (target) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          addResolvedEdge({
            sourcePath,
            sourceLayer,
            target,
            line: line + 1,
            loader: kind,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return { edges, errors };
}

const DEFAULT_RUNTIME_GLOBAL_BOUNDARY = {
  roots: ["src/SynCloudOS/**", "src/main.tsx"],
  allowed: ["src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts"],
  globals: [
    "window",
    "document",
    "globalThis",
    "navigator",
    "history",
    "location",
    "screen",
    "visualViewport",
    "matchMedia",
    "localStorage",
    "sessionStorage",
    "Notification",
    "setTimeout",
    "clearTimeout",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ],
};

function isTypeOnlyIdentifier(node) {
  let current = node.parent;
  while (current) {
    if (ts.isImportDeclaration(current)) {
      return Boolean(current.importClause?.isTypeOnly);
    }
    if (ts.isImportSpecifier(current) || ts.isExportSpecifier(current)) {
      return Boolean(current.isTypeOnly || current.parent?.isTypeOnly);
    }
    if (ts.isTypeNode(current)) return true;
    if (
      ts.isVariableDeclaration(current) ||
      ts.isParameter(current) ||
      ts.isPropertyDeclaration(current) ||
      ts.isPropertySignature(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isMethodSignature(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isClassDeclaration(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isEnumDeclaration(current) ||
      ts.isModuleDeclaration(current)
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isDeclarationName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isModuleDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.name === node
  ) {
    return true;
  }
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isBindingElement(parent) && parent.name === node
  ) {
    if (parent.name === node || parent.propertyName === node) return true;
  }
  return false;
}

function normalizedFileName(path) {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

function isProjectLocalReference(node, checker) {
  const symbol = checker.getSymbolAtLocation(node);
  return Boolean(symbol?.declarations?.some((declaration) => !declaration.getSourceFile().isDeclarationFile));
}

function runtimeGlobalBoundary(policy) {
  const configured = policy?.runtimeGlobalBoundary;
  return {
    roots: Array.isArray(configured?.roots)
      ? configured.roots
      : DEFAULT_RUNTIME_GLOBAL_BOUNDARY.roots,
    allowed: Array.isArray(configured?.allowed)
      ? configured.allowed
      : DEFAULT_RUNTIME_GLOBAL_BOUNDARY.allowed,
    globals: new Set(
      Array.isArray(configured?.globals) && configured.globals.length > 0
        ? configured.globals
        : DEFAULT_RUNTIME_GLOBAL_BOUNDARY.globals,
    ),
  };
}

const DEFAULT_IDENTITY_COOKIE_BOUNDARY = {
  allowed: [
    "src/SynCloudOS/PlatformAdapters/BrowserIdentityCookieAdapter.ts",
    "src/SynCloudOS/PlatformAdapters/identityCookieAdapterTypes.ts",
    "src/SynCloudOS/Identity/**",
    "src/SynCloudOS/LoginServices/**",
  ],
};

function identityCookieBoundary(policy) {
  const configured = policy?.identityCookieBoundary;
  return {
    allowed: Array.isArray(configured?.allowed) && configured.allowed.length > 0
      ? configured.allowed
      : DEFAULT_IDENTITY_COOKIE_BOUNDARY.allowed,
  };
}

export function validateIdentityCookieBoundary({
  root = DEFAULT_ROOT,
  files,
  policy,
} = {}) {
  const errors = [];
  const boundary = identityCookieBoundary(policy);
  const candidates = (Array.isArray(files) ? files : discoverTypeScriptFiles(root))
    .filter((sourcePath) => sourcePath.startsWith("src/"));
  const accessPatterns = [
    /\bcookie\b/i,
    /\bset-cookie\b/i,
  ];
  for (const sourcePath of candidates) {
    if (boundary.allowed.some((pattern) => patternMatches(sourcePath, pattern))) continue;
    const absolute = resolve(root, sourcePath);
    if (!existsSync(absolute)) continue;
    const sourceText = readFileSync(absolute, "utf8");
    const sourceFile = ts.createSourceFile(
      absolute,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    let nodeReported = false;
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const moduleName = node.moduleSpecifier.text;
        if (moduleName.includes("identityCookieAdapterTypes")) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          addError(errors, `${sourcePath}:${line + 1} imports identityCookieAdapterTypes outside the approved identity cookie adapter boundary`);
          nodeReported = true;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    sourceText.split(/\r?\n/u).forEach((lineText, index) => {
      if (!accessPatterns.some((pattern) => pattern.test(lineText))) return;
      if (nodeReported && /identityCookieAdapterTypes/u.test(lineText)) return;
      addError(errors, `${sourcePath}:${index + 1} accesses cookie data outside the approved identity/service adapter boundary`);
    });
  }
  return errors;
}

export function validateRuntimeBrowserGlobals({
  root = DEFAULT_ROOT,
  files,
  policy,
} = {}) {
  const errors = [];
  const boundary = runtimeGlobalBoundary(policy);
  const candidates = Array.isArray(files)
    ? files
    : discoverTypeScriptFiles(root);
  const checkedSources = candidates
    .filter((sourcePath) => boundary.roots.some((pattern) => patternMatches(sourcePath, pattern)))
    .filter((sourcePath) => !boundary.allowed.some((pattern) => patternMatches(sourcePath, pattern)))
    .map((sourcePath) => ({ sourcePath, absolute: resolve(root, sourcePath) }))
    .filter(({ absolute }) => existsSync(absolute));
  if (checkedSources.length === 0) return errors;

  const compilerOptions = {
    ...loadCompilerOptions(root),
    noEmit: true,
  };
  const programme = ts.createProgram(
    checkedSources.map(({ absolute }) => absolute),
    compilerOptions,
  );
  const checker = programme.getTypeChecker();
  const programmeSources = new Map(
    programme.getSourceFiles().map((sourceFile) => [normalizedFileName(sourceFile.fileName), sourceFile]),
  );

  for (const { sourcePath, absolute } of checkedSources) {
    const sourceFile = programmeSources.get(normalizedFileName(absolute));
    if (!sourceFile) continue;
    function visit(node) {
      if (
        ts.isIdentifier(node) &&
        boundary.globals.has(node.text) &&
        !isTypeOnlyIdentifier(node) &&
        !isDeclarationName(node) &&
        !isProjectLocalReference(node, checker)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        addError(
          errors,
          `${sourcePath}:${line + 1} accesses browser global ${node.text} outside the platform adapter boundary`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return errors;
}

const keyboardGlobalNames = new Set(["window", "document", "globalThis", "Reflect"]);
const keyboardListenerMethods = new Set(["addEventListener", "removeEventListener"]);
const keyboardEventNames = new Set(["keydown", "keyup"]);

function keyboardSymbolKey(node, checker) {
  if (!ts.isIdentifier(node)) return null;
  let symbol = checker?.getSymbolAtLocation(node) ?? null;
  if (symbol && checker && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    try { symbol = checker.getAliasedSymbol(symbol) ?? symbol; } catch { /* unresolved aliases are not global targets */ }
  }
  return symbol ?? `name:${node.text}`;
}

function keyboardStringValue(node, context, seen = new Set()) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return keyboardStringValue(node.expression, context, seen);
  }
  if (ts.isIdentifier(node)) {
    const key = keyboardSymbolKey(node, context.checker);
    if (key === null || seen.has(key)) return null;
    const bound = context.bindings.get(key);
    if (bound?.kind === "string") return bound.value;
    if (bound?.node) return keyboardStringValue(bound.node, context, new Set([...seen, key]));
    const declaration = context.checker?.getSymbolAtLocation(node)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return keyboardStringValue(declaration.initializer, context, new Set([...seen, key]));
    }
    return null;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = keyboardStringValue(node.left, context, seen);
    const right = keyboardStringValue(node.right, context, seen);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function keyboardPropertyValue(base, property) {
  if (base?.kind === "target" && base.target === "Reflect" && property === "apply") return { kind: "reflectApply" };
  if (!base || !property || base.kind !== "target") return { kind: "unknown" };
  if (keyboardListenerMethods.has(property)) {
    return { kind: "listener", target: base.target, method: property };
  }
  if ((base.target === "globalThis" && (property === "window" || property === "document")) ||
      (base.target === "window" && property === "document")) {
    return { kind: "target", target: property === "window" ? "window" : "document" };
  }
  return { kind: "unknown" };
}

function keyboardArrayElements(node, context, seen = new Set()) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return keyboardArrayElements(node.expression, context, seen);
  }
  if (ts.isArrayLiteralExpression(node)) return [...node.elements];
  if (ts.isIdentifier(node)) {
    const key = keyboardSymbolKey(node, context.checker);
    if (key === null || seen.has(key)) return null;
    const nextSeen = new Set([...seen, key]);
    const bound = context.bindings.get(key);
    if (bound?.node) return keyboardArrayElements(bound.node, context, nextSeen);
    const declaration = context.checker?.getSymbolAtLocation(node)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) return keyboardArrayElements(declaration.initializer, context, nextSeen);
  }
  return null;
}

function keyboardBindingValue(binding, context, seen) {
  if (!binding) return { kind: "unknown" };
  if (binding.kind) return binding;
  if (binding.node) return keyboardValue(binding.node, context, seen);
  return { kind: "unknown" };
}

function keyboardValue(node, context, seen = new Set()) {
  if (!node) return { kind: "unknown" };
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return keyboardValue(node.expression, context, seen);
  }
  if (ts.isStringLiteralLike(node) || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
    const value = keyboardStringValue(node, context, seen);
    return value === null ? { kind: "unknown" } : { kind: "string", value };
  }
  if (ts.isIdentifier(node)) {
    const key = keyboardSymbolKey(node, context.checker);
    if (key === null || seen.has(key)) return { kind: "unknown" };
    const nextSeen = new Set([...seen, key]);
    const bound = context.bindings.get(key);
    if (bound) return keyboardBindingValue(bound, context, nextSeen);
    if (keyboardGlobalNames.has(node.text) && !(context.checker && isProjectLocalReference(node, context.checker))) {
      return { kind: "target", target: node.text };
    }
    const symbol = context.checker?.getSymbolAtLocation(node);
    const declaration = symbol?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return keyboardValue(declaration.initializer, context, nextSeen);
    }
    if (declaration && ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable = pattern && ts.isObjectBindingPattern(pattern) ? pattern.parent : null;
      if (variable && ts.isVariableDeclaration(variable) && variable.initializer) {
        const property = propertyName(declaration.propertyName ?? declaration.name);
        return keyboardPropertyValue(keyboardValue(variable.initializer, context, nextSeen), property);
      }
    }
    if (declaration && ts.isFunctionDeclaration(declaration) && declaration.body) {
      return { kind: "wrapper", node: declaration };
    }
    return { kind: "unknown" };
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return { kind: "wrapper", node };
  if (ts.isPropertyAccessExpression(node)) {
    return keyboardPropertyValue(keyboardValue(node.expression, context, seen), node.name.text);
  }
  if (ts.isElementAccessExpression(node)) {
    return keyboardPropertyValue(
      keyboardValue(node.expression, context, seen),
      keyboardStringValue(node.argumentExpression, context, seen),
    );
  }
  if (ts.isCallExpression(node)) {
    const bindExpression = node.expression;
    if (ts.isPropertyAccessExpression(bindExpression) && bindExpression.name.text === "bind") {
      const listener = keyboardValue(bindExpression.expression, context, seen);
      const target = keyboardValue(node.arguments[0], context, seen);
      if (listener.kind === "listener" && target.kind === "target") {
        return { kind: "listener", target: target.target, method: listener.method };
      }
    }
  }
  return { kind: "unknown" };
}

function keyboardWrapperCalls(wrapper, invocation, context, visited = new Set()) {
  if (!wrapper?.node || visited.has(wrapper.node)) return [];
  const nextVisited = new Set([...visited, wrapper.node]);
  const bindings = new Map(context.bindings);
  wrapper.node.parameters.forEach((parameter, index) => {
    if (!ts.isIdentifier(parameter.name)) return;
    const key = keyboardSymbolKey(parameter.name, context.checker);
    if (key !== null && invocation.arguments[index]) {
      bindings.set(key, { node: invocation.arguments[index] });
    }
  });
  const wrapperContext = { ...context, bindings };
  const calls = [];
  const visit = (node) => {
    if (node !== wrapper.node.body && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) return;
    if (ts.isCallExpression(node)) {
      const nestedInvocation = keyboardInvocation(node, wrapperContext);
      const value = nestedInvocation?.callable ?? { kind: "unknown" };
      const eventName = keyboardStringValue(nestedInvocation?.args[0], wrapperContext);
      if (value.kind === "listener" && keyboardEventNames.has(eventName)) {
        calls.push({ target: value.target, method: value.method });
      } else if (value.kind === "wrapper") {
        calls.push(...keyboardWrapperCalls(value, { ...node, arguments: nestedInvocation.args }, wrapperContext, nextVisited));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(wrapper.node.body);
  return calls;
}

function keyboardInvocation(node, context) {
  if (!ts.isCallExpression(node)) return null;
  if (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)) {
    const property = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : keyboardStringValue(node.expression.argumentExpression, context);
    if (property === "call" || property === "apply") {
      const callable = keyboardValue(node.expression.expression, context);
      const args = property === "call" ? node.arguments.slice(1) : keyboardArrayElements(node.arguments[1], context);
      return args ? { callable, args } : null;
    }
  }
  const callable = keyboardValue(node.expression, context);
  if (callable.kind === "reflectApply") {
    const reflected = keyboardValue(node.arguments[0], context);
    const args = keyboardArrayElements(node.arguments[2], context);
    return args ? { callable: reflected, args } : null;
  }
  return { callable, args: [...node.arguments] };
}

function keyboardListenerCalls(node, context) {
  const invocation = keyboardInvocation(node, context);
  if (!invocation) return [];
  const value = invocation.callable;
  const eventName = keyboardStringValue(invocation.args[0], context);
  if (value.kind === "listener" && keyboardEventNames.has(eventName)) {
    return [{ target: value.target, method: value.method }];
  }
  if (value.kind !== "wrapper") return [];
  const wrapperInvocation = { ...node, arguments: invocation.args };
  return keyboardWrapperCalls(value, wrapperInvocation, context);
}

export function validateGlobalKeyboardListeners({ root = DEFAULT_ROOT, files, policy } = {}) {
  const errors = [];
  const roots = policy?.globalKeyboardBoundary?.roots ?? ["src/**"];
  const deferred = new Set(policy?.globalKeyboardBoundary?.deferredUntilTask ?? []);
  const candidates = (Array.isArray(files) ? files : discoverTypeScriptFiles(root))
    .filter((sourcePath) => Array.isArray(files) || roots.some((pattern) => patternMatches(sourcePath, pattern)))
    .map((sourcePath) => ({ sourcePath, absolute: resolve(root, sourcePath) }))
    .filter(({ absolute }) => existsSync(absolute));
  // Fixtures deliberately retain a `.fixture` suffix so scanner coverage can
  // exercise the same compiler/symbol path as production TypeScript.
  const regular = candidates.filter(({ sourcePath }) => /\.[cm]?[jt]sx?(?:\.fixture)?$/u.test(sourcePath));
  const compilerOptions = { ...loadCompilerOptions(root), noEmit: true, allowNonTsExtensions: true };
  const programme = regular.length > 0 ? ts.createProgram(regular.map(({ absolute }) => absolute), compilerOptions) : null;
  const checker = programme?.getTypeChecker() ?? null;
  const programmeSources = new Map((programme?.getSourceFiles() ?? []).map((sourceFile) => [normalizedFileName(sourceFile.fileName), sourceFile]));

  for (const { sourcePath, absolute } of candidates) {
    const sourceText = readFileSync(absolute, "utf8");
    const sourceFile = programmeSources.get(normalizedFileName(absolute)) ?? ts.createSourceFile(
      absolute,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      sourcePath.includes(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const context = { checker, bindings: new Map() };
    const report = (node, target, method) => {
      if (deferred.has(sourcePath)) return;
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      addError(errors, `${sourcePath}:${line + 1} [raw-global-keyboard-listener] resolves ${target}.${method}`);
    };
    function visit(node) {
      for (const call of keyboardListenerCalls(node, context)) report(node, call.target, call.method);
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return [...new Set(errors)];
}

function validatePolicy(policy, root) {
  const errors = [];
  if (!policy || policy.schemaVersion !== 1 || !Array.isArray(policy.layers)) {
    return ["boundary policy must use schemaVersion 1 and declare layers"];
  }
  const validPattern = (pattern) =>
    typeof pattern === "string" &&
    pattern.trim() !== "" &&
    (!GLOB_META.test(pattern) || pattern.endsWith("/**"));
  if (
    !Array.isArray(policy.controlledSources) ||
    policy.controlledSources.length === 0 ||
    policy.controlledSources.some((pattern) => !validPattern(pattern))
  ) {
    addError(errors, "controlledSources must contain exact or tree patterns");
  } else if (!policy.controlledSources.includes("src/**")) {
    addError(errors, "controlledSources must include required anchor src/**");
  }
  if (!Array.isArray(policy.exclusions)) {
    addError(errors, "exclusions must be an array");
  } else {
    const exclusionPaths = new Set();
    for (const exclusion of policy.exclusions) {
      if (
        !exclusion ||
        typeof exclusion.path !== "string" ||
        GLOB_META.test(exclusion.path) ||
        typeof exclusion.reason !== "string" ||
        exclusion.reason.trim() === ""
      ) {
        addError(errors, "boundary exclusions require an exact path and reason");
        continue;
      }
      if (exclusionPaths.has(exclusion.path)) {
        addError(errors, `duplicate boundary exclusion ${exclusion.path}`);
      }
      exclusionPaths.add(exclusion.path);
    }
  }
  if (!Array.isArray(policy.aliases)) {
    addError(errors, "aliases must be an array");
  } else {
    const aliases = new Set();
    for (const alias of policy.aliases) {
      if (
        !alias ||
        typeof alias.find !== "string" ||
        alias.find.trim() === "" ||
        typeof alias.replacement !== "string" ||
        alias.replacement.trim() === ""
      ) {
        addError(errors, "boundary aliases require find and replacement strings");
        continue;
      }
      if (aliases.has(alias.find)) {
        addError(errors, `duplicate boundary alias ${alias.find}`);
      }
      aliases.add(alias.find);
    }
  }

  const layerIds = new Set();
  for (const layer of policy.layers) {
    if (
      !layer ||
      typeof layer !== "object" ||
      typeof layer?.id !== "string" ||
      layer.id === "" ||
      layerIds.has(layer.id)
    ) {
      addError(errors, `invalid or duplicate boundary layer ${layer?.id}`);
      continue;
    }
    layerIds.add(layer.id);
    if (
      !Array.isArray(layer.include) ||
      layer.include.length === 0 ||
      layer.include.some((pattern) => !validPattern(pattern))
    ) {
      addError(errors, `${layer.id} has invalid include patterns`);
    }
    if (!Array.isArray(layer.mayImportLayers)) {
      addError(errors, `${layer.id} must declare mayImportLayers`);
    }
    if (
      !layer.mayImportEntrypoints ||
      typeof layer.mayImportEntrypoints !== "object" ||
      Array.isArray(layer.mayImportEntrypoints)
    ) {
      addError(errors, `${layer.id} must declare mayImportEntrypoints`);
    }
  }
  for (const layer of policy.layers.filter(
    (entry) => entry && typeof entry.id === "string",
  )) {
    for (const targetLayer of Array.isArray(layer.mayImportLayers) ? layer.mayImportLayers : []) {
      if (!layerIds.has(targetLayer)) {
        addError(errors, `${layer.id} imports unknown layer ${targetLayer}`);
      }
    }
    for (const [targetLayer, entrypoints] of Object.entries(
      layer.mayImportEntrypoints ?? {},
    )) {
      if (!layerIds.has(targetLayer)) {
        addError(
          errors,
          `${layer.id} has entrypoints for unknown layer ${targetLayer}`,
        );
      }
      if (
        !Array.isArray(entrypoints) ||
        entrypoints.some(
          (entrypoint) =>
            typeof entrypoint !== "string" ||
            GLOB_META.test(entrypoint) ||
            entrypoint.endsWith("/"),
        )
      ) {
        addError(
          errors,
          `${layer.id} has non-exact entrypoints for ${targetLayer}`,
        );
      }
      if (!layer.mayImportLayers?.includes(targetLayer)) {
        addError(
          errors,
          `${layer.id} declares entrypoints for disallowed layer ${targetLayer}`,
        );
      }
    }
  }

  if (
    policy.temporaryAllowlist !== undefined &&
    !Array.isArray(policy.temporaryAllowlist)
  ) {
    addError(errors, "temporaryAllowlist must be an array");
    return errors;
  }
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  for (const entry of policy.temporaryAllowlist ?? []) {
    const key = `${entry?.source} ${entry?.target}`;
    if (seen.has(key)) {
      addError(
        errors,
        `duplicate temporary allowlist edge ${String(entry?.source)} -> ${String(entry?.target)}`,
      );
    }
    seen.add(key);
    if (
      typeof entry?.source !== "string" ||
      typeof entry?.target !== "string" ||
      GLOB_META.test(entry.source) ||
      GLOB_META.test(entry.target) ||
      !/\.[a-z0-9]+$/i.test(entry.source) ||
      !/\.[a-z0-9]+$/i.test(entry.target)
    ) {
      addError(errors, "temporary allowlist entries require exact source and target files");
    }
    // Every temporary edge names why it exists and the date it must be gone by.
    if (
      typeof entry?.reason !== "string" ||
      entry.reason.trim() === "" ||
      typeof entry?.expires !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires) ||
      Number.isNaN(Date.parse(`${entry.expires}T00:00:00Z`))
    ) {
      addError(
        errors,
        `temporary allowlist edge ${entry?.source} -> ${entry?.target} needs a reason and an expires date (YYYY-MM-DD)`,
      );
    } else if (entry.expires < today) {
      addError(
        errors,
        `expired temporary allowlist edge ${entry.source} -> ${entry.target} (expired ${entry.expires})`,
      );
    }
    if (Object.hasOwn(entry, "migration")) {
      addError(
        errors,
        `temporary allowlist edge ${entry?.source} -> ${entry?.target} contains obsolete boundary-transition metadata`,
      );
    }
  }
  return errors;
}

function crossAppPrivateEdge(source, target) {
  const sourceMatch = source.match(/^src\/SynWare\/([^/]+\.app)\/Contents\//);
  const targetMatch = target.match(/^src\/SynWare\/([^/]+\.app)\/Contents\//);
  return (
    sourceMatch &&
    targetMatch &&
    sourceMatch[1] !== targetMatch[1]
  );
}

function edgeViolation(edge, policy) {
  const sourceLayer = policy.layers.find(
    (layer) => layer.id === edge.sourceLayer,
  );
  if (!sourceLayer || !Array.isArray(sourceLayer.mayImportLayers)) {
    return `${edge.sourceLayer} has no valid import policy`;
  }
  if (!sourceLayer.mayImportLayers.includes(edge.targetLayer)) {
    return `${edge.sourceLayer} may not import ${edge.targetLayer}`;
  }
  if (crossAppPrivateEdge(edge.source, edge.target)) {
    return "a SynWare may not import another app's private Contents";
  }
  const entrypoints =
    sourceLayer.mayImportEntrypoints?.[edge.targetLayer];
  if (entrypoints && !entrypoints.includes(edge.target)) {
    return `${edge.sourceLayer} must use a public ${edge.targetLayer} entrypoint`;
  }
  return null;
}

export function validateImportEdges(input = {}) {
  const inputErrors = [];
  const options = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    inputErrors.push("boundary validation input must be an object");
  }
  const repositoryRoot =
    typeof options.root === "string" ? resolve(options.root) : DEFAULT_ROOT;
  const policy = options.policy;
  const errors = [...inputErrors, ...validatePolicy(policy, repositoryRoot)];
  for (const error of validateConfiguredAliases(policy, repositoryRoot)) addError(errors, error);
  if (!existsSync(repositoryRoot)) {
    addError(errors, `repository root ${repositoryRoot} does not exist`);
  }
  if (errors.length > 0) {
    return { errors, checkedFiles: 0, checkedEdges: 0 };
  }
  let files;
  let repositoryFiles;
  const rgRunner =
    typeof options.rgRunner === "function" ? options.rgRunner : execFileSync;
  try {
    files = discoverTypeScriptFiles(repositoryRoot, rgRunner);
    repositoryFiles = discoverRepositoryFiles(repositoryRoot, rgRunner);
  } catch (error) {
    addError(
      errors,
      `boundary discovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { errors, checkedFiles: 0, checkedEdges: 0 };
  }
  const controlledPatterns = policy.controlledSources;
  const exclusions = new Set(
    policy.exclusions.map(({ path }) => path),
  );
  const isControlled = (path) =>
    controlledPatterns.some((pattern) => patternMatches(path, pattern)) &&
    !exclusions.has(path);
  const controlledFiles = files.filter(isControlled);
  if (controlledFiles.length === 0) {
    addError(errors, "controlled source anchor src/** has no discovered TypeScript files");
  }
  const checkedFiles = [];
  for (const path of controlledFiles) {
    const result = classification(path, policy.layers);
    if (result.ambiguous.length > 0) {
      addError(
        errors,
        `ambiguous boundary classification for ${path}: ${result.ambiguous
          .map(({ id }) => id)
          .join(", ")}`,
      );
    } else if (!result.layer) {
      addError(errors, `unclassified controlled source ${path}`);
    } else {
      checkedFiles.push(path);
    }
  }
  const compilerOptions = loadCompilerOptions(repositoryRoot);
  const aliases = [
    ...policy.aliases.map((alias) => ({
      find: alias.find,
      replacement: isAbsolute(alias.replacement)
        ? alias.replacement
        : resolve(repositoryRoot, alias.replacement),
    })),
    ...loadViteAliases(repositoryRoot),
  ];
  const extracted = extractEdges({
    root: repositoryRoot,
    files: checkedFiles,
    repositoryFiles,
    layers: policy.layers,
    compilerOptions,
    aliases,
    isControlled,
  });
  const edges = extracted.edges;
  for (const error of extracted.errors) addError(errors, error);
  for (const error of validateRuntimeBrowserGlobals({
    root: repositoryRoot,
    files,
    policy,
  })) addError(errors, error);
  for (const error of validateIdentityCookieBoundary({
    root: repositoryRoot,
    files,
    policy,
  })) addError(errors, error);
  for (const error of validateGlobalKeyboardListeners({
    root: repositoryRoot,
    files,
    policy,
  })) addError(errors, error);
  const allowlist = new Map(
    (policy.temporaryAllowlist ?? []).map((entry) => [
      `${entry.source}\0${entry.target}`,
      entry,
    ]),
  );
  const observed = new Set(
    edges.map(({ source, target }) => `${source}\0${target}`),
  );
  const required = new Set();

  for (const edge of edges) {
    const violation = edgeViolation(edge, policy);
    if (!violation) continue;
    const key = `${edge.source}\0${edge.target}`;
    if (allowlist.has(key)) {
      required.add(key);
      continue;
    }
    addError(
      errors,
      `${edge.source}:${edge.line} -> ${edge.target}: ${violation}`,
    );
  }
  for (const [key, entry] of allowlist) {
    if (!observed.has(key)) {
      addError(
        errors,
        `stale temporary allowlist edge ${entry.source} -> ${entry.target}`,
      );
    } else if (!required.has(key)) {
      addError(
        errors,
        `temporary allowlist edge is no longer required ${entry.source} -> ${entry.target}`,
      );
    }
  }
  return {
    errors,
    checkedFiles: checkedFiles.length,
    checkedEdges: edges.length,
  };
}

export {
  resolveGlobTargets,
};

function main() {
  const policyRead = readContainedRepositoryText(
    DEFAULT_ROOT,
    POLICY_PATH,
    "boundary policy",
  );
  if (policyRead.errors.length > 0 || typeof policyRead.text !== "string") {
    throw new Error(policyRead.errors.join("\n") || "boundary policy cannot be read safely");
  }
  const policy = JSON.parse(policyRead.text);
  const result = validateImportEdges({ root: DEFAULT_ROOT, policy });
  if (result.errors.length > 0) {
    process.stderr.write(`${result.errors.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${result.checkedFiles} files and ${result.checkedEdges} edges: dependency boundaries validated\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(SCRIPT_PATH)
) {
  main();
}
