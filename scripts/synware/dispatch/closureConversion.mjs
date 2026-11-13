/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from "node:fs";
import { parseAst } from "rollup/parseAst";
import { WORKER_SAFE_GLOBALS } from "./workerGlobals.mjs";

const workerSafeEntriesUrl = new URL("../../../src/FX/DispatchFX/internal/workerSafeEntries.json", import.meta.url);
let cachedDefaultEntries;

function getDefaultWorkerSafeEntries() {
  if (!cachedDefaultEntries) {
    cachedDefaultEntries = JSON.parse(readFileSync(workerSafeEntriesUrl, "utf8"));
  }
  return cachedDefaultEntries;
}

const BUILTIN_CLONEABLE_CONSTRUCTORS = new Set([
  "Array", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float16Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array", "ArrayBuffer", "SharedArrayBuffer", "DataView",
  "Map", "Set", "Date", "RegExp", "Error", "TypeError", "RangeError", "URL", "URLSearchParams", "NSEData",
]);

const SAFE_COLLECTION_METHODS = new Set([
  "map", "filter", "reduce", "reduceRight", "forEach", "some", "every", "find", "findIndex",
  "findLast", "findLastIndex", "flat", "flatMap", "includes", "indexOf", "lastIndexOf",
  "slice", "subarray", "concat", "join", "entries", "keys", "values", "at", "get", "has",
  "trim", "trimStart", "trimEnd", "split", "replace", "replaceAll", "toLowerCase",
  "toUpperCase", "startsWith", "endsWith", "test", "exec", "toString", "valueOf", "toFixed",
]);

function defaultIsWorkerSafe(specifier, importedNames = []) {
  const entries = getDefaultWorkerSafeEntries();
  if (entries.safeEntries.includes(specifier)) return true;
  if (entries.safeSubpaths.some(prefix => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
    const blocked = entries.unsafeExports?.[specifier] ?? [];
    return !importedNames.some(name => blocked.includes(name));
  }
  return false;
}

function isSimpleLiteral(node) {
  if (!node) return false;
  if (node.type === "Literal") return !(node.regex);
  if (node.type === "TemplateLiteral") return node.expressions.length === 0;
  if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+" || node.operator === "!")) {
    return isSimpleLiteral(node.argument);
  }
  if (node.type === "Identifier" && node.name === "undefined") return true;
  return false;
}

function inferCloneShape(initNode) {
  if (!initNode) return "unknown";
  if (initNode.type === "ArrayExpression") return "array";
  if (initNode.type === "Literal" || initNode.type === "TemplateLiteral") return "primitive";
  if (initNode.type === "NewExpression" && initNode.callee?.type === "Identifier") {
    return BUILTIN_CLONEABLE_CONSTRUCTORS.has(initNode.callee.name) ? "builtin" : "classInstance";
  }
  return "unknown";
}

function collectPatternBindings(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case "Identifier":
      out.push(pattern.name);
      break;
    case "RestElement":
      collectPatternBindings(pattern.argument, out);
      break;
    case "AssignmentPattern":
      collectPatternBindings(pattern.left, out);
      break;
    case "ArrayPattern":
      for (const elem of pattern.elements) if (elem) collectPatternBindings(elem, out);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") collectPatternBindings(prop.argument, out);
        else collectPatternBindings(prop.value, out);
      }
      break;
  }
  return out;
}

function collectLexicalBlockDeclarations(blockNode, out = []) {
  if (!blockNode || blockNode.type !== "BlockStatement") return out;
  for (const stmt of blockNode.body) {
    if (stmt.type === "VariableDeclaration" && stmt.kind !== "var") {
      for (const item of stmt.declarations) {
        const shape = inferCloneShape(item.init);
        for (const name of collectPatternBindings(item.id)) out.push({ name, kind: stmt.kind, shape });
      }
    } else if (stmt.type === "ClassDeclaration" && stmt.id) {
      out.push({ name: stmt.id.name, kind: "class", shape: "class" });
    }
  }
  return out;
}

function collectHoistedDeclarations(body, out = []) {
  if (!body) return out;
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "ClassDeclaration" ||
      node.type === "ClassExpression"
    ) {
      if (node.type === "FunctionDeclaration" && node.id) {
        out.push({ name: node.id.name, kind: "function", shape: "unknown", literalInit: false, initNode: null });
      }
      return;
    }
    if (node.type === "VariableDeclaration" && node.kind === "var") {
      for (const decl of node.declarations) {
        const shape = inferCloneShape(decl.init);
        for (const name of collectPatternBindings(decl.id)) {
          out.push({ name, kind: "var", shape, literalInit: false, initNode: decl.init });
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "start" || key === "end" || key === "type") continue;
      const val = node[key];
      if (Array.isArray(val)) for (const item of val) visit(item);
      else if (val && typeof val.type === "string") visit(val);
    }
  };
  if (Array.isArray(body)) for (const stmt of body) visit(stmt);
  else visit(body);
  return out;
}

function isFunctionNode(node) {
  return Boolean(node && (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression"));
}

function endsWithMainMember(node) {
  return Boolean(
    node &&
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property?.type === "Identifier" &&
    node.property.name === "main",
  );
}

function matchOuterCandidateCall(node) {
  if (node.type === "CallExpression") {
    const callee = node.callee;
    const args = node.arguments ?? [];
    if (callee?.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
      const prop = callee.property.name;
      if (prop === "async" && args.length >= 1 && args.length <= 2) {
        if (endsWithMainMember(callee.object)) return null;
        const fn = args[args.length - 1];
        if (isFunctionNode(fn)) return { kind: "async", fn };
      }
      if (prop === "notify" && args.length >= 2 && args.length <= 3) {
        if (endsWithMainMember(args[0])) return null;
        const fn = args[args.length - 1];
        if (isFunctionNode(fn)) return { kind: "notify", fn };
      }
      if (prop === "concurrentPerform" && args.length === 2 && isFunctionNode(args[1])) {
        return { kind: "concurrentPerform", fn: args[1] };
      }
    } else if (callee?.type === "Identifier" && callee.name === "concurrentPerform" && args.length === 2 && isFunctionNode(args[1])) {
      return { kind: "concurrentPerform", fn: args[1] };
    }
  } else if (node.type === "NewExpression") {
    const callee = node.callee;
    const isWorkItem =
      (callee?.type === "Identifier" && callee.name === "DFXWorkItem") ||
      (callee?.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier" && callee.property.name === "DFXWorkItem");
    if (isWorkItem) {
      const args = node.arguments ?? [];
      if (args.length >= 1 && args.length <= 2 && isFunctionNode(args[args.length - 1])) {
        return { kind: "workItem", fn: args[args.length - 1] };
      }
    }
  }
  return null;
}

function matchNestedMainContinuation(node) {
  if (node.type !== "CallExpression") return null;
  const callee = node.callee;
  const args = node.arguments ?? [];
  if (callee?.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
    if (callee.property.name === "async" && endsWithMainMember(callee.object) && args.length >= 1 && isFunctionNode(args[args.length - 1])) {
      return args[args.length - 1];
    }
    if (callee.property.name === "notify" && args.length >= 2 && endsWithMainMember(args[0]) && isFunctionNode(args[args.length - 1])) {
      return args[args.length - 1];
    }
  }
  if (callee?.type === "Identifier" && callee.name === "notify" && args.length >= 2 && endsWithMainMember(args[0]) && isFunctionNode(args[args.length - 1])) {
    return args[args.length - 1];
  }
  return null;
}

function isPropertyIdentifier(node, parent) {
  if (!parent || node.type !== "Identifier") return false;
  if (parent.type === "MemberExpression" && !parent.computed && parent.property === node) return true;
  if (parent.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand) return true;
  if ((parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") && parent.key === node && !parent.computed) return true;
  if (parent.type === "LabeledStatement" && parent.label === node) return true;
  if ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") && parent.label === node) return true;
  if (parent.type === "ImportSpecifier" && parent.imported === node && parent.local !== node) return true;
  if (parent.type === "ExportSpecifier" && parent.exported === node && parent.local !== node) return true;
  if (parent.type === "ExportAllDeclaration" && parent.exported === node) return true;
  return false;
}

function isBindingIdentifier(node, parent) {
  if (!parent || node.type !== "Identifier") return false;
  if (parent.type === "VariableDeclarator" && parent.id === node) return true;
  if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ClassDeclaration" || parent.type === "ClassExpression") && parent.id === node) return true;
  if (parent.type === "CatchClause" && parent.param === node) return true;
  if (parent.type === "ImportSpecifier" || parent.type === "ImportDefaultSpecifier" || parent.type === "ImportNamespaceSpecifier") return true;
  if (parent.type === "ExportAllDeclaration" && parent.exported === node) return true;
  return false;
}

function resolveBinding(scopes, name) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].bindings.has(name)) {
      return { scope: scopes[i], binding: scopes[i].bindings.get(name), depth: i };
    }
  }
  return null;
}

function lineColumnAt(code, offset) {
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < offset; i++) {
    if (code.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}

function applySplices(code, splices) {
  const ordered = [...splices].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const s of ordered) {
    if (s.start < cursor) continue;
    out += code.slice(cursor, s.start) + s.text;
    cursor = s.end;
  }
  return out + code.slice(cursor);
}

const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encodeVLQ(value) {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let encoded = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
}

function decodeVLQ(str, ref) {
  let result = 0;
  let shift = 0;
  let cont = true;
  while (cont) {
    const digit = VLQ_CHARS.indexOf(str[ref.i++]);
    cont = (digit & 32) !== 0;
    result += (digit & 31) << shift;
    shift += 5;
  }
  const neg = (result & 1) === 1;
  result >>= 1;
  return neg ? -result : result;
}

function decodeSourceMapLines(mappings) {
  const out = [];
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  for (const line of mappings.split(";")) {
    const segs = [];
    let genCol = 0;
    if (line.length > 0) {
      for (const seg of line.split(",")) {
        if (!seg) continue;
        const ref = { i: 0 };
        genCol += decodeVLQ(seg, ref);
        if (ref.i < seg.length) {
          srcIdx += decodeVLQ(seg, ref);
          srcLine += decodeVLQ(seg, ref);
          srcCol += decodeVLQ(seg, ref);
          segs.push({ genCol, srcIdx, srcLine, srcCol });
        }
      }
    }
    out.push(segs);
  }
  return out;
}

/** Compose an outer transform map (generated -> mid) over an inner map (mid -> original). */
export function composeSourceMaps(innerMap, outerMap) {
  if (!innerMap) return outerMap;
  if (!outerMap) return innerMap;
  const innerLines = decodeSourceMapLines(innerMap.mappings);
  const outerLines = decodeSourceMapLines(outerMap.mappings);
  const findOrig = (midLine, midCol) => {
    const segs = innerLines[midLine];
    if (!segs || segs.length === 0) return null;
    let best = segs[0];
    for (const seg of segs) {
      if (seg.genCol <= midCol) best = seg;
      else break;
    }
    return { srcIdx: best.srcIdx, srcLine: best.srcLine, srcCol: Math.max(0, best.srcCol + (midCol - best.genCol)) };
  };
  let prevSrcIdx = 0;
  let prevSrcLine = 0;
  let prevSrcCol = 0;
  const encodedLines = outerLines.map(segs => {
    let prevGenCol = 0;
    const encodedSegs = [];
    for (const seg of segs) {
      const orig = findOrig(seg.srcLine, seg.srcCol);
      if (!orig) continue;
      encodedSegs.push(
        encodeVLQ(seg.genCol - prevGenCol) +
        encodeVLQ(orig.srcIdx - prevSrcIdx) +
        encodeVLQ(orig.srcLine - prevSrcLine) +
        encodeVLQ(orig.srcCol - prevSrcCol),
      );
      prevGenCol = seg.genCol;
      prevSrcIdx = orig.srcIdx;
      prevSrcLine = orig.srcLine;
      prevSrcCol = orig.srcCol;
    }
    return encodedSegs.join(",");
  });
  return {
    version: 3,
    file: outerMap.file ?? innerMap.file,
    sources: innerMap.sources,
    sourcesContent: innerMap.sourcesContent,
    names: [],
    mappings: encodedLines.join(";"),
  };
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function offsetToLineCol(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, col: offset - lineStarts[lo] };
}

function buildSpliceSourceMap(id, code, splices) {
  const lineStarts = buildLineStarts(code);
  const ordered = [...splices].sort((a, b) => a.start - b.start || a.end - b.end);
  const lines = [[]];
  let genLine = 0;
  let genCol = 0;
  let prevGenCol = 0;
  let prevSrcLine = 0;
  let prevSrcCol = 0;

  const pushMapping = (srcLine, srcCol) => {
    lines[genLine].push(
      encodeVLQ(genCol - prevGenCol) +
      encodeVLQ(0) +
      encodeVLQ(srcLine - prevSrcLine) +
      encodeVLQ(srcCol - prevSrcCol),
    );
    prevGenCol = genCol;
    prevSrcLine = srcLine;
    prevSrcCol = srcCol;
  };

  const newline = () => {
    lines.push([]);
    genLine++;
    genCol = 0;
    prevGenCol = 0;
  };

  const emitUnchanged = (fromOffset, toOffset) => {
    if (toOffset <= fromOffset) return;
    let pos = offsetToLineCol(lineStarts, fromOffset);
    pushMapping(pos.line, pos.col);
    let i = fromOffset;
    while (i < toOffset) {
      const nl = code.indexOf("\n", i);
      if (nl === -1 || nl >= toOffset) {
        genCol += toOffset - i;
        break;
      }
      newline();
      i = nl + 1;
      if (i < toOffset) {
        pos = offsetToLineCol(lineStarts, i);
        pushMapping(pos.line, pos.col);
      }
    }
  };

  const emitInserted = (text, mapOffset = null) => {
    if (!text) return;
    if (mapOffset !== null) {
      const pos = offsetToLineCol(lineStarts, mapOffset);
      pushMapping(pos.line, pos.col);
    }
    let i = 0;
    while (i < text.length) {
      const nl = text.indexOf("\n", i);
      if (nl === -1) {
        genCol += text.length - i;
        break;
      }
      newline();
      i = nl + 1;
    }
  };

  let cursor = 0;
  for (const s of ordered) {
    if (s.start < cursor) continue;
    emitUnchanged(cursor, s.start);
    emitInserted(s.text, s.mapSource ? s.start : null);
    cursor = s.end;
  }
  emitUnchanged(cursor, code.length);

  return {
    version: 3,
    file: id,
    sources: [id],
    sourcesContent: [code],
    names: [],
    mappings: lines.map(segs => segs.join(",")).join(";"),
  };
}

function findInsertionOffsetAfterImports(ast, code) {
  let lastImportEnd = 0;
  for (const stmt of ast.body) {
    if (stmt.type === "ImportDeclaration") lastImportEnd = stmt.end;
    else break;
  }
  if (lastImportEnd === 0) return 0;
  while (lastImportEnd < code.length && (code[lastImportEnd] === "\r" || code[lastImportEnd] === "\n")) {
    lastImportEnd++;
  }
  return lastImportEnd;
}

/**
 * Analyse and convert DispatchFX sendable closures into worker-annotated functions
 * with hoisted main-thread continuations and extracted worker bodies.
 */
export function convertDispatchClosures(code, id, options = {}) {
  const parse = options.parse ?? (source => parseAst(source));
  const checkWorkerSafe = options.isWorkerSafe ?? defaultIsWorkerSafe;
  const strict = Boolean(options.strict);
  const runtimeSpecifier = options.runtimeSpecifier ?? "virtual:syncloudos/dispatch-sendable";
  const closureIdPrefix = options.closureIdPrefix ?? id.replaceAll("\\", "/");

  const ast = parse(code);
  const entries = getDefaultWorkerSafeEntries();
  function collectModuleBindings(astBody, sourceCode) {
    const bindings = new Map();
    for (const stmt of astBody) {
      if (stmt.type === "ImportDeclaration") {
        const source = stmt.source.value;
        for (const spec of stmt.specifiers) {
          const imported =
            spec.type === "ImportDefaultSpecifier" ? "default"
              : spec.type === "ImportNamespaceSpecifier" ? "*"
                : spec.imported.name;
          bindings.set(spec.local.name, {
            name: spec.local.name,
            kind: "import",
            specifier: source,
            imported,
            safe: isImportWorkerSafe(source, imported, checkWorkerSafe, entries),
          });
        }
      } else if (stmt.type === "VariableDeclaration") {
        for (const decl of stmt.declarations) {
          const literalInit = stmt.kind === "const" && isSimpleLiteral(decl.init);
          const shape = inferCloneShape(decl.init);
          const initSource = literalInit ? sourceCode.slice(decl.init.start, decl.init.end) : null;
          for (const name of collectPatternBindings(decl.id)) {
            bindings.set(name, { name, kind: stmt.kind, shape, literalInit, initSource, declNode: decl });
          }
        }
      } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
        bindings.set(stmt.id.name, { name: stmt.id.name, kind: "function", shape: "function", literalInit: false });
      } else if (stmt.type === "ClassDeclaration" && stmt.id) {
        bindings.set(stmt.id.name, { name: stmt.id.name, kind: "class", shape: "class", literalInit: false });
      } else if (stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
        const declNode = stmt.declaration;
        if (declNode.type === "VariableDeclaration") {
          for (const decl of declNode.declarations) {
            const literalInit = declNode.kind === "const" && isSimpleLiteral(decl.init);
            const initSource = literalInit ? sourceCode.slice(decl.init.start, decl.init.end) : null;
            for (const name of collectPatternBindings(decl.id)) {
              bindings.set(name, { name, kind: declNode.kind, shape: inferCloneShape(decl.init), literalInit, initSource });
            }
          }
        } else if (declNode.type === "FunctionDeclaration" && declNode.id) {
          bindings.set(declNode.id.name, { name: declNode.id.name, kind: "function", shape: "function", literalInit: false });
        } else if (declNode.type === "ClassDeclaration" && declNode.id) {
          bindings.set(declNode.id.name, { name: declNode.id.name, kind: "class", shape: "class", literalInit: false });
        }
      } else if (stmt.type === "ExportDefaultDeclaration" && stmt.declaration?.id) {
        const declNode = stmt.declaration;
        const kind = declNode.type === "ClassDeclaration" ? "class" : "function";
        bindings.set(declNode.id.name, { name: declNode.id.name, kind, shape: kind, literalInit: false });
      }
    }
    return bindings;
  }

  const moduleBindings = collectModuleBindings(ast.body, code);

  const closures = [];
  const diagnostics = [];
  const mainSplices = [];
  let closureCounter = 0;

  function pushScope(scopes, kind, bindings = []) {
    const map = new Map();
    for (const b of bindings) map.set(b.name, b);
    scopes.push({ kind, bindings: map });
  }

  function enterBlockOrFunctionBindings(node, parent, scopes) {
    if (node.type === "Program") {
      pushScope(scopes, "module", [...moduleBindings.values()]);
      return true;
    }
    if (isFunctionNode(node) || node.type === "FunctionDeclaration") {
      const fnBindings = [];
      if (node.type === "FunctionExpression" && node.id) {
        fnBindings.push({ name: node.id.name, kind: "function", shape: "unknown" });
      }
      for (const param of node.params) {
        for (const name of collectPatternBindings(param)) {
          fnBindings.push({ name, kind: "param", shape: "unknown" });
        }
      }
      for (const hoisted of collectHoistedDeclarations(node.body)) fnBindings.push(hoisted);
      for (const lexical of collectLexicalBlockDeclarations(node.body)) fnBindings.push(lexical);
      pushScope(scopes, "function", fnBindings);
      return true;
    }
    if (node.type === "BlockStatement" || node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement" || node.type === "CatchClause") {
      const bindings = [];
      if (node.type === "CatchClause" && node.param) {
        for (const name of collectPatternBindings(node.param)) {
          bindings.push({ name, kind: "catch", shape: "unknown" });
        }
      } else if (node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") {
        const decl = node.init?.type === "VariableDeclaration" ? node.init : node.left?.type === "VariableDeclaration" ? node.left : null;
        if (decl && decl.kind !== "var") {
          for (const item of decl.declarations) {
            const shape = inferCloneShape(item.init);
            for (const name of collectPatternBindings(item.id)) bindings.push({ name, kind: decl.kind, shape });
          }
        }
      } else if (node.type === "BlockStatement" && !(parent && (isFunctionNode(parent) || parent.type === "FunctionDeclaration"))) {
        for (const stmt of node.body) {
          if (stmt.type === "VariableDeclaration" && stmt.kind !== "var") {
            for (const item of stmt.declarations) {
              const shape = inferCloneShape(item.init);
              for (const name of collectPatternBindings(item.id)) bindings.push({ name, kind: stmt.kind, shape });
            }
          } else if (stmt.type === "ClassDeclaration" && stmt.id) {
            bindings.push({ name: stmt.id.name, kind: "class", shape: "class" });
          }
        }
      }
      if (bindings.length > 0) {
        pushScope(scopes, "block", bindings);
        return true;
      }
    }
    return false;
  }

  function analyzeCandidate(candidate, outerScopes) {
    const fn = candidate.fn;
    const closureId = `${closureIdPrefix}#${closureCounter++}`;
    const pos = lineColumnAt(code, fn.start);

    if (fn.async || fn.generator) {
      diagnostics.push({ file: id, ...pos, reason: "async or generator closure cannot be sent to a worker", severity: strict ? "error" : "warning" });
      return;
    }

    const baseDepth = outerScopes.length;
    const closureScopes = [...outerScopes];
    const captures = [];
    const captureSet = new Set();
    const imports = [];
    const importSet = new Set();
    const constants = [];
    const constantSet = new Set();
    const continuations = [];
    const workerSplices = [];
    let rejection = null;

    function reject(reason) {
      if (!rejection) rejection = reason;
    }

    // Bind closure's own parameters and hoisted vars cleanly at depth `baseDepth`.
    const fnBindings = [];
    if (fn.type === "FunctionExpression" && fn.id) {
      fnBindings.push({ name: fn.id.name, kind: "function", shape: "unknown" });
    }
    for (const p of fn.params) {
      for (const name of collectPatternBindings(p)) fnBindings.push({ name, kind: "param", shape: "unknown" });
    }
    for (const h of collectHoistedDeclarations(fn.body)) fnBindings.push(h);
    for (const l of collectLexicalBlockDeclarations(fn.body)) fnBindings.push(l);
    pushScope(closureScopes, "function", fnBindings);

    function analyzeContinuation(contFn, callNode) {
      const contId = `${closureId}:c${continuations.length}`;
      const workerValues = [];
      const workerValueSet = new Set();

      const contBindings = [];
      for (const p of contFn.params) {
        for (const name of collectPatternBindings(p)) contBindings.push({ name, kind: "param", shape: "unknown" });
      }
      for (const h of collectHoistedDeclarations(contFn.body)) contBindings.push(h);
      for (const l of collectLexicalBlockDeclarations(contFn.body)) contBindings.push(l);
      pushScope(closureScopes, "function", contBindings);
      const contDepth = closureScopes.length - 1;

      function walkCont(node, parent) {
        if (!node || typeof node !== "object" || rejection) return;
        const pushed = node !== contFn && enterBlockOrFunctionBindings(node, parent, closureScopes);

        if (node.type === "AssignmentExpression") {
          for (const targetName of collectPatternBindings(node.left)) {
            const resolved = resolveBinding(closureScopes, targetName);
            if (resolved && resolved.depth >= baseDepth && resolved.depth < contDepth) {
              reject(`continuation assigns to worker local \`${targetName}\``);
            }
          }
        } else if (node.type === "UpdateExpression" && node.argument?.type === "Identifier") {
          const targetName = node.argument.name;
          const resolved = resolveBinding(closureScopes, targetName);
          if (resolved && resolved.depth >= baseDepth && resolved.depth < contDepth) {
            reject(`continuation assigns to worker local \`${targetName}\``);
          }
        } else if (node.type === "Identifier" && !isPropertyIdentifier(node, parent) && !isBindingIdentifier(node, parent)) {
          const isParam = parent?.type === "ArrowFunctionExpression" || parent?.type === "FunctionExpression" || parent?.type === "FunctionDeclaration";
          if (!isParam) {
            const resolved = resolveBinding(closureScopes, node.name);
            if (resolved && resolved.depth >= baseDepth && resolved.depth < contDepth) {
              if (!workerValueSet.has(node.name)) {
                workerValueSet.add(node.name);
                workerValues.push(node.name);
              }
            }
          }
        }

        for (const key of Object.keys(node)) {
          if (key === "start" || key === "end" || key === "type") continue;
          const val = node[key];
          if (Array.isArray(val)) for (const item of val) walkCont(item, node);
          else if (val && typeof val.type === "string") walkCont(val, node);
        }

        if (pushed) closureScopes.pop();
      }

      walkCont(contFn.body, contFn);
      closureScopes.pop();

      const paramList = workerValues.join(", ");
      const contBodySource = contFn.body.type === "BlockStatement"
        ? code.slice(contFn.body.start, contFn.body.end)
        : `{ return (${code.slice(contFn.body.start, contFn.body.end)}); }`;
      const hoistedCode = `__dfxContinuation(${JSON.stringify(contId)}, (${paramList}) => ${contBodySource})`;

      continuations.push({ id: contId, workerValues, hoistedCode });
      workerSplices.push({
        start: callNode.start - fn.start,
        end: callNode.end - fn.start,
        text: `__dfxEnqueueContinuation(${JSON.stringify(contId)}, [${workerValues.join(", ")}])`,
      });
    }

    function walkWorker(node, parent) {
      if (!node || typeof node !== "object" || rejection) return;

      if (node !== fn) {
        const contFn = matchNestedMainContinuation(node);
        if (contFn) {
          analyzeContinuation(contFn, node);
          return;
        }
      }

      if (node.type === "ThisExpression") {
        reject("references `this`, which is not sendable to a worker");
        return;
      }
      if (node.type === "Super") {
        reject("references `super`, which is not sendable to a worker");
        return;
      }

      const pushed = node !== fn && enterBlockOrFunctionBindings(node, parent, closureScopes);

      if (node.type === "AssignmentExpression") {
        for (const name of collectPatternBindings(node.left)) {
          const resolved = resolveBinding(closureScopes, name);
          if (resolved && resolved.depth < baseDepth) {
            reject(`assigns to captured variable \`${name}\`; captures are read-only`);
          }
        }
      } else if (node.type === "UpdateExpression" && node.argument?.type === "Identifier") {
        const resolved = resolveBinding(closureScopes, node.argument.name);
        if (resolved && resolved.depth < baseDepth) {
          reject(`assigns to captured variable \`${node.argument.name}\`; captures are read-only`);
        }
      } else if (node.type === "CallExpression" && node.callee?.type === "MemberExpression" && !node.callee.computed) {
        const obj = node.callee.object;
        const prop = node.callee.property;
        if (obj?.type === "Identifier" && prop?.type === "Identifier") {
          const resolved = resolveBinding(closureScopes, obj.name);
          if (resolved && resolved.depth > 0 && resolved.depth < baseDepth) {
            if (resolved.binding.shape === "classInstance" || (resolved.binding.shape === "unknown" && !SAFE_COLLECTION_METHODS.has(prop.name))) {
              reject(`captures class instance \`${obj.name}\` used by method call; structured clone drops prototypes and methods`);
            }
          }
        }
      } else if (node.type === "Identifier" && !isPropertyIdentifier(node, parent) && !isBindingIdentifier(node, parent)) {
        const isParamList = parent && (isFunctionNode(parent) || parent.type === "FunctionDeclaration") && parent.params.includes(node);
        if (!isParamList) {
          if (node.name === "arguments") {
            const insideInnerFn = closureScopes.slice(baseDepth + 1).some(s => s.kind === "function");
            if (!insideInnerFn && fn.type === "ArrowFunctionExpression") {
              reject("references `arguments`, which is not sendable to a worker");
              if (pushed) closureScopes.pop();
              return;
            }
          }
          const resolved = resolveBinding(closureScopes, node.name);
          if (!resolved) {
            if (!WORKER_SAFE_GLOBALS.has(node.name)) {
              reject(`references non-worker global \`${node.name}\`; move UI work into DFXQueue.main.async`);
            }
          } else if (resolved.depth < baseDepth) {
            const binding = resolved.binding;
            if (resolved.depth === 0) {
              if (binding.kind === "import") {
                if (!binding.safe) {
                  reject(`imports \`${node.name}\` from non-worker-safe module "${binding.specifier}"`);
                } else if (!importSet.has(node.name)) {
                  importSet.add(node.name);
                  imports.push({ specifier: binding.specifier, imported: binding.imported, local: binding.name });
                }
              } else if (binding.literalInit) {
                if (!constantSet.has(node.name)) {
                  constantSet.add(node.name);
                  constants.push({ local: node.name, initSource: binding.initSource });
                }
              } else {
                reject(`references non-literal module binding \`${node.name}\`; move creation inside the closure or pass as a capture`);
              }
            } else {
              if (!captureSet.has(node.name)) {
                captureSet.add(node.name);
                captures.push(node.name);
              }
            }
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === "start" || key === "end" || key === "type") continue;
        const val = node[key];
        if (Array.isArray(val)) for (const item of val) walkWorker(item, node);
        else if (val && typeof val.type === "string") walkWorker(val, node);
      }

      if (pushed) closureScopes.pop();
    }

    walkWorker(fn.body, fn);
    closureScopes.pop();

    if (rejection) {
      diagnostics.push({ file: id, ...pos, reason: rejection, severity: strict ? "error" : "warning" });
      return;
    }

    const params = fn.params.map(p => code.slice(p.start, p.end));
    const originalSlice = code.slice(fn.start, fn.end);
    const rewrittenBodyText = applySplices(
      originalSlice.slice(fn.body.start - fn.start, fn.body.end - fn.start),
      workerSplices.map(s => ({
        start: s.start - (fn.body.start - fn.start),
        end: s.end - (fn.body.start - fn.start),
        text: s.text,
      })),
    );
    const allWorkerParams = [...captures, ...params];
    const workerFnSource = fn.body.type === "BlockStatement"
      ? `function(${allWorkerParams.join(", ")}) ${rewrittenBodyText}`
      : `function(${allWorkerParams.join(", ")}) { return (${rewrittenBodyText}); }`;

    closures.push({
      closureId,
      params,
      captures,
      imports,
      constants,
      body: workerFnSource,
      continuations: continuations.map(({ id: contId, workerValues }) => ({ id: contId, workerValues })),
    });

    const contArg = continuations.length
      ? `, [${continuations.map(c => c.hoistedCode).join(", ")}]`
      : "";
    mainSplices.push(
      { start: fn.start, end: fn.start, text: "__dfxSendable(", mapSource: true },
      { start: fn.end, end: fn.end, text: `, ${JSON.stringify(closureId)}, () => [${captures.join(", ")}]${contArg})`, mapSource: false },
    );
  }

  const scanScopes = [];
  function scan(node, parent) {
    if (!node || typeof node !== "object") return;
    const pushed = enterBlockOrFunctionBindings(node, parent, scanScopes);
    const candidate = matchOuterCandidateCall(node);
    if (candidate) {
      analyzeCandidate(candidate, scanScopes);
      if (pushed) scanScopes.pop();
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "start" || key === "end" || key === "type") continue;
      const val = node[key];
      if (Array.isArray(val)) for (const item of val) scan(item, node);
      else if (val && typeof val.type === "string") scan(val, node);
    }
    if (pushed) scanScopes.pop();
  }
  scan(ast, null);

  if (strict && diagnostics.length > 0) {
    const first = diagnostics[0];
    throw new Error(`${first.file}:${first.line}:${first.column}: ${first.reason}`);
  }

  if (closures.length === 0) {
    return { code, map: null, closures, diagnostics };
  }

  const insertAt = findInsertionOffsetAfterImports(ast, code);
  const needsContinuationHelper = closures.some(c => c.continuations.length > 0);
  const importedNames = needsContinuationHelper ? "__dfxSendable, __dfxContinuation" : "__dfxSendable";
  mainSplices.push({
    start: insertAt,
    end: insertAt,
    text: `import { ${importedNames} } from ${JSON.stringify(runtimeSpecifier)};\n`,
  });

  const output = applySplices(code, mainSplices);
  const map = buildSpliceSourceMap(id, code, mainSplices);
  return { code: output, map, closures, diagnostics };
}

/** Return unresolved global identifiers outside WORKER_SAFE_GLOBALS in an AST module. */
export function findNonWorkerSafeGlobals(ast) {
  const topNames = new Set();
  const topHoisted = collectHoistedDeclarations(ast.body);
  for (const h of topHoisted) topNames.add(h.name);
  for (const stmt of ast.body) {
    if (stmt.type === "ImportDeclaration") {
      for (const spec of stmt.specifiers) topNames.add(spec.local.name);
    } else if (stmt.type === "VariableDeclaration") {
      for (const decl of stmt.declarations) for (const name of collectPatternBindings(decl.id)) topNames.add(name);
    } else if ((stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") && stmt.id) {
      topNames.add(stmt.id.name);
    } else if (stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
      const declNode = stmt.declaration;
      if (declNode.type === "VariableDeclaration") {
        for (const decl of declNode.declarations) for (const name of collectPatternBindings(decl.id)) topNames.add(name);
      } else if (declNode.id) {
        topNames.add(declNode.id.name);
      }
    } else if (stmt.type === "ExportDefaultDeclaration" && stmt.declaration?.id) {
      topNames.add(stmt.declaration.id.name);
    }
  }

  const scopes = [new Set(topNames)];
  const unsafe = new Set();

  const isBound = name => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].has(name)) return true;
    }
    return false;
  };

  function enterNode(node, parent) {
    const names = new Set();
    if (isFunctionNode(node) || node.type === "FunctionDeclaration") {
      if ((node.type === "FunctionExpression" || node.type === "FunctionDeclaration") && node.id) names.add(node.id.name);
      for (const p of node.params) for (const n of collectPatternBindings(p)) names.add(n);
      for (const h of collectHoistedDeclarations(node.body)) names.add(h.name);
      for (const l of collectLexicalBlockDeclarations(node.body)) names.add(l.name);
      names.add("arguments");
      scopes.push(names);
      return true;
    }
    if (node.type === "ClassExpression" || node.type === "ClassDeclaration") {
      if (node.id) names.add(node.id.name);
      if (names.size > 0) {
        scopes.push(names);
        return true;
      }
      return false;
    }
    if (node.type === "CatchClause" && node.param) {
      for (const n of collectPatternBindings(node.param)) names.add(n);
      scopes.push(names);
      return true;
    }
    if (node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") {
      const decl = node.init?.type === "VariableDeclaration" ? node.init : node.left?.type === "VariableDeclaration" ? node.left : null;
      if (decl && decl.kind !== "var") {
        for (const item of decl.declarations) for (const n of collectPatternBindings(item.id)) names.add(n);
      }
      if (names.size > 0) {
        scopes.push(names);
        return true;
      }
      return false;
    }
    if (node.type === "BlockStatement" && !(parent && (isFunctionNode(parent) || parent.type === "FunctionDeclaration"))) {
      for (const l of collectLexicalBlockDeclarations(node)) names.add(l.name);
      if (names.size > 0) {
        scopes.push(names);
        return true;
      }
    }
    return false;
  }

  function walk(node, parent) {
    if (!node || typeof node !== "object") return;
    const pushed = enterNode(node, parent);
    if (node.type === "Identifier" && !isPropertyIdentifier(node, parent) && !isBindingIdentifier(node, parent)) {
      const isParam = parent && (isFunctionNode(parent) || parent.type === "FunctionDeclaration") && parent.params.includes(node);
      if (!isParam && !isBound(node.name) && !WORKER_SAFE_GLOBALS.has(node.name)) {
        unsafe.add(node.name);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "start" || key === "end" || key === "type") continue;
      const val = node[key];
      if (Array.isArray(val)) for (const item of val) walk(item, node);
      else if (val && typeof val.type === "string") walk(val, node);
    }
    if (pushed) scopes.pop();
  }

  walk(ast, null);
  return [...unsafe];
}

function isImportWorkerSafe(specifier, importedName, checkWorkerSafe, entries) {
  if (!checkWorkerSafe(specifier, [importedName])) return false;
  const blocked = entries.unsafeExports?.[specifier];
  if (blocked && blocked.includes(importedName)) return false;
  return true;
}
