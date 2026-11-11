/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * Rewrites selectors into shapes the browser's style engine can index, without changing what they
 * match or their specificity.
 *
 * Chrome files each rule under one simple selector of its rightmost compound (an id, class, attribute
 * name or tag) and tests only rules filed under something an element has. A rule whose rightmost
 * compound is only pseudo-classes, such as `:scope:is([data-nse-control="x"])` or a multi-argument
 * `:is(a, b)`, is filed under nothing and tested against every element. Within a compound, simple
 * selectors are tested in order, so cheap attribute comparisons belong before `:where()`, `:is()`
 * and `:not()` arguments that walk ancestors.
 *
 * - `:scope:is(X)` and `:where(:scope):is(X)` become `X:scope` and `X:where(:scope)`.
 * - A rightmost compound with nothing to file it under, holding a multi-argument `:is()` or `:where()`,
 *   is split into one selector per argument; `:is()` branches are padded to the list's specificity.
 * - Every compound puts its type, id, class and attribute selectors first.
 */
import * as cssTree from "css-tree";

const indexable = new Set(["TypeSelector", "IdSelector", "ClassSelector", "AttributeSelector"]);
const zero = [0, 0, 0];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const max = list => list.reduce((best, next) => compare(next, best) > 0 ? next : best, zero);
const legacyPseudoElements = new Set(["before", "after", "first-line", "first-letter"]);

/** CSS Selectors 4 specificity of a css-tree Selector or SelectorList node. */
export function specificity(node) {
  if (node.type === "SelectorList") return max(node.children.toArray().map(specificity));
  let total = zero;
  for (const child of node.children) total = add(total, simple(child));
  return total;
}
function simple(node) {
  switch (node.type) {
    case "IdSelector": return [1, 0, 0];
    case "ClassSelector": case "AttributeSelector": return [0, 1, 0];
    case "TypeSelector": return node.name === "*" || node.name.endsWith("|*") ? zero : [0, 0, 1];
    case "PseudoElementSelector": return [0, 0, 1];
    case "PseudoClassSelector": {
      const name = node.name.toLowerCase();
      if (legacyPseudoElements.has(name)) return [0, 0, 1];
      if (name === "where") return zero;
      const list = node.children?.first;
      if (["is", "not", "has", "matches", "-webkit-any"].includes(name) && list?.type === "SelectorList") return max(list.children.toArray().map(specificity));
      if ((name === "nth-child" || name === "nth-last-child") && list?.type === "Nth" && list.selector) return add([0, 1, 0], specificity(list.selector));
      return [0, 1, 0];
    }
    default: return zero;
  }
}

const generate = node => cssTree.generate(node);
const parseSelector = text => cssTree.parse(text, { context: "selector" });

/** Splits a css-tree Selector into compounds: [{ combinator, parts: [simple selectors] }]. */
function compounds(selector) {
  const out = [{ combinator: null, parts: [] }];
  for (const child of selector.children) {
    if (child.type === "Combinator") out.push({ combinator: child.name, parts: [] });
    else out.at(-1).parts.push(child);
  }
  return out;
}
const combinatorText = name => name === " " ? " " : ` ${name} `;
function join(list) {
  return list.map(({ combinator, parts }, index) => (index ? combinatorText(combinator) : "") + parts.map(generate).join("")).join("");
}

const rank = node => {
  if (node.type === "TypeSelector") return 0;
  if (node.type === "IdSelector" || node.type === "ClassSelector") return 1;
  if (node.type === "AttributeSelector") return node.value ? 2 : 3;
  if (node.type === "PseudoElementSelector" || node.type === "PseudoClassSelector" && legacyPseudoElements.has(node.name.toLowerCase())) return 9;
  if (node.type === "PseudoClassSelector") {
    const name = node.name.toLowerCase();
    if (name === "scope") return 4;
    const args = argumentList(node);
    if ((name === "is" || name === "where") && args?.length === 1 && compounds(args[0]).length === 1 && args[0].children.toArray().every(child => indexable.has(child.type))) return 2;
    if (["is", "where", "not", "has"].includes(name)) return 6;
    return 5;
  }
  return 5;
};
/**
 * Stable reorder: cheap tests first. Only the part before the first pseudo-element moves: what follows
 * a pseudo-element (`::-webkit-scrollbar-thumb:hover`) qualifies it. A compound holding `&` is kept.
 */
function reorder(parts) {
  if (parts.some(node => node.type === "NestingSelector")) return parts;
  const end = parts.findIndex(node => rank(node) === 9);
  const head = end < 0 ? parts : parts.slice(0, end), tail = end < 0 ? [] : parts.slice(end);
  return [...head.map((node, index) => ({ node, index })).sort((a, b) => rank(a.node) - rank(b.node) || a.index - b.index).map(entry => entry.node), ...tail];
}

const isPseudo = (node, ...names) => node.type === "PseudoClassSelector" && names.includes(node.name.toLowerCase());
const argumentList = node => node.children?.first?.type === "SelectorList" ? node.children.first.children.toArray() : null;
/** Inside @scope a selector without :scope or & is read as `:scope …`; splitting must not drop either. */
const mentionsScope = node => /:scope(?![\w-])|&/u.test(generate(node));
const isScopeMarker = node => isPseudo(node, "scope") || isPseudo(node, "where") && argumentList(node)?.length === 1 && generate(argumentList(node)[0]) === ":scope";

/**
 * A simple selector that matches every element and counts as `missing` specificity: `:is(*, X)`
 * takes its most specific argument's weight. Types repeat through descendant steps inside the list.
 */
function padding(missing) {
  if (missing.some(value => value < 0)) return null;
  if (!missing.some(Boolean)) return "";
  const last = (missing[2] ? "_" : "") + "#_".repeat(missing[0]) + "._".repeat(missing[1]);
  return `:is(*, ${"_ ".repeat(Math.max(0, missing[2] - 1))}${last})`;
}

/** Rewrites one complex selector (text) into one or more selectors with identical meaning. */
function rewriteSelector(text) {
  const selector = parseSelector(text);
  const target = specificity(selector);
  let list = compounds(selector);

  // 1. Root twins: `:scope:is(X) …` / `:where(:scope):is(X) …` become `X:scope …`.
  const first = list[0];
  if (first.parts.length === 2 && isScopeMarker(first.parts[0]) && isPseudo(first.parts[1], "is")) {
    const args = argumentList(first.parts[1]);
    const endsInPseudoElement = arg => compounds(arg).at(-1).parts.some(node => rank(node) === 9);
    if (args && !args.some(endsInPseudoElement)) {
      const scope = generate(first.parts[0]);
      const tail = list.length > 1 ? join([{ combinator: null, parts: [] }, ...list.slice(1)]) : "";
      const padded = padBranches(args.map(arg => generate(arg) + scope + tail), target);
      if (padded) return padded.flatMap(rewriteSelector);
    }
  }

  // 2. Rightmost compound with nothing indexable: split a multi-argument :is()/:where().
  const subject = list.at(-1);
  if (!subject.parts.some(node => indexable.has(node.type))) {
    const at = subject.parts.findIndex(node => isPseudo(node, "is", "where") && (argumentList(node)?.length ?? 0) > 1 && argumentList(node).every(arg => compounds(arg).length === 1 && !mentionsScope(arg)));
    if (at >= 0) {
      const args = argumentList(subject.parts[at]);
      const keepsSpecificity = isPseudo(subject.parts[at], "is");
      const branches = args.map(arg => {
        const parts = [...subject.parts];
        const replacement = keepsSpecificity ? generate(arg) : `:where(${generate(arg)})`;
        const before = join([...list.slice(0, -1), { combinator: subject.combinator, parts: parts.slice(0, at) }]);
        const after = parts.slice(at + 1).map(generate).join("");
        return before + replacement + after;
      });
      const padded = padBranches(branches, target);
      if (padded) return padded.flatMap(rewriteSelector);
    }
  }

  // 3. Cheap tests first in every compound.
  list = list.map(entry => ({ ...entry, parts: reorder(entry.parts) }));
  const out = join(list);
  if (compare(specificity(parseSelector(out)), target) !== 0) throw new Error(`Specificity changed: ${text} → ${out}`);
  return [out];
}

/** Pads branch selectors up to the original specificity; null when padding cannot be exact. */
function padBranches(branches, target) {
  const out = [];
  for (const branch of branches) {
    const have = specificity(parseSelector(branch));
    const missing = [target[0] - have[0], target[1] - have[1], target[2] - have[2]];
    const pad = padding(missing);
    if (pad === null) return null;
    if (!pad) { out.push(branch); continue; }
    // Pad the subject compound, before any pseudo-element.
    const selector = parseSelector(branch), list = compounds(selector), subject = list.at(-1);
    const at = subject.parts.findIndex(node => rank(node) === 9);
    const padded = parseSelector(pad).children.first;
    subject.parts.splice(at < 0 ? subject.parts.length : at, 0, padded);
    out.push(join(list));
  }
  return out;
}

/** Rewrites every style rule's selectors in a stylesheet's source text; everything else is kept byte for byte. */
export function optimiseSelectors(source) {
  const ast = cssTree.parse(source, { positions: true, parseValue: false, parseCustomProperty: false, parseAtrulePrelude: false });
  const edits = [];
  cssTree.walk(ast, { visit: "Rule", enter(rule) {
    if (rule.prelude.type !== "SelectorList" || !rule.prelude.loc) return;
    const before = rule.prelude.children.toArray().map(generate);
    const after = [...new Set(before.flatMap(rewriteSelector))];
    if (after.join(",") === before.join(",")) return;
    edits.push({ start: rule.prelude.loc.start.offset, end: rule.prelude.loc.end.offset, text: after.join(",\n") });
  } });
  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

/** PostCSS plugin: the same rewrite for stylesheets compiled by Vite (framework, Atmo and app CSS). */
export function selectorPerformance() {
  return {
    postcssPlugin: "syncloudos-selector-performance",
    OnceExit(root) {
      // Published SDK styles were rewritten when the SDK was built.
      if (root.source?.input.file?.replaceAll("\\", "/").includes("/node_modules/")) return;
      root.walkRules((rule) => {
        if (rule.parent?.type === "atrule" && /keyframes$/iu.test(rule.parent.name)) return;
        const list = cssTree.parse(rule.selector, { context: "selectorList" });
        const before = list.children.toArray().map(generate);
        const after = [...new Set(before.flatMap(rewriteSelector))];
        if (after.join(",") !== before.join(",")) rule.selector = after.join(",\n");
      });
    },
  };
}
selectorPerformance.postcss = true;
