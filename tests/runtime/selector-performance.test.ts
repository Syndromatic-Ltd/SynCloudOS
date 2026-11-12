import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as cssTree from "css-tree";
import { optimiseSelectors, specificity } from "../../scripts/synware/selector-performance.mjs";
import { scopeThemeCSS } from "../../scripts/synware/theme-loading.mjs";

const selectors = (css: string) => {
  const out: string[] = [];
  cssTree.walk(cssTree.parse(css), { visit: "Rule", enter(rule) { if (rule.prelude.type === "SelectorList") for (const s of rule.prelude.children) out.push(cssTree.generate(s)); } });
  return out;
};
const weight = (selector: string) => specificity(cssTree.parse(selector, { context: "selector" })).join(",");

describe("selector performance rewriting", () => {
  it("files a root twin under its own hook instead of under nothing", () => {
    const out = optimiseSelectors(':scope:is([data-nse-control="tab-view"]) [data-nse-role="tabpanel"] { color: red }');
    expect(selectors(out)).toEqual(['.nse\\:control\\=tab-view:scope .nse\\:role\\=tabpanel']);
    expect(weight(selectors(out)[0])).toBe(weight(':scope:is([data-nse-control="tab-view"]) [data-nse-role="tabpanel"]'));
  });

  it("splits an unindexed :is() into branches padded to the list's specificity", () => {
    const original = ':where(:scope) :is([data-nse-part="a"], .b.c)';
    const out = selectors(optimiseSelectors(`${original} { color: red }`));
    expect(out).toHaveLength(2);
    for (const branch of out) expect(weight(branch)).toBe(weight(original));
  });

  it("keeps :where() branches weightless", () => {
    const out = selectors(optimiseSelectors(':where(:scope) :where([data-nse-part="a"], [data-nse-part="b"]) { color: red }'));
    expect(out).toEqual([':where(:scope) :where(.nse\\:part\\=a)', ':where(:scope) :where(.nse\\:part\\=b)']);
  });

  it("puts indexable tests first but never moves anything past a pseudo-element", () => {
    expect(selectors(optimiseSelectors(':hover[data-a="1"]::before { color: red }'))).toEqual(['[data-a="1"]:hover::before']);
    expect(selectors(optimiseSelectors(".a::-webkit-scrollbar-thumb:hover { color: red }"))).toEqual([".a::-webkit-scrollbar-thumb:hover"]);
  });

  it("never splits away a :scope or & that @scope would otherwise imply", () => {
    expect(selectors(optimiseSelectors(":where(:scope) :is(:scope, .x) { color: red }"))).toEqual([":where(:scope) :is(:scope,.x)"]);
    expect(optimiseSelectors(".p { &:hover.q { color: red } }")).toBe(".p { &:hover.q { color: red } }");
  });

  it("leaves everything but rewritten selectors byte for byte", () => {
    const source = `/* keep */\n.a { --x: url("data:image/svg+xml,%3Csvg%20a='1'%3E"); }\n:scope:is(.b) .c{color:red}\n`;
    const out = optimiseSelectors(source);
    expect(out).toContain(`/* keep */\n.a { --x: url("data:image/svg+xml,%3Csvg%20a='1'%3E"); }\n`);
    expect(out).toContain(".b:scope .c{color:red}");
  });

  it("is idempotent", () => {
    const source = ':scope:is([data-nse-control="x"]) :is([data-nse-part="a"], [data-nse-part="b"]):hover { color: red }';
    const once = optimiseSelectors(source);
    expect(optimiseSelectors(once)).toBe(once);
  });

  it("rewrites the whole Atmo bundle without changing any selector's specificity", () => {
    // optimiseSelectors throws if a rewrite would change a selector's specificity.
    const resources = resolve(import.meta.dirname, "../../src/Themes/Atmo.scostheme/Contents/Resources");
    for (const file of readdirSync(resources).filter((name) => name.endsWith(".css"))) {
      expect(() => optimiseSelectors(readFileSync(resolve(resources, file), "utf8")), file).not.toThrow();
    }
  }, 120_000);

  it("gives third-party themes the same treatment", () => {
    const css = scopeThemeCSS('[data-nse-control="button"] [data-nse-part="bezel"] { background: white; }', "com.example.paper");
    expect(css).not.toContain(":scope:is(");
    // The author wrote attributes; the engine is handed classes it can index.
    expect(css).toContain(".nse\\:control\\=button");
    expect(css).toContain(".nse\\:part\\=bezel");
    expect(css).not.toContain('[data-nse-part="bezel"]');
  });

  it("rewrites contract hook selectors to their mirror classes at the same weight", () => {
    const original = '[data-nse-control="button"][data-nse-hovered] [data-nse-part="bezel"]:not([data-nse-enabled="false"])';
    const out = selectors(optimiseSelectors(`${original} { color: red }`));
    expect(out).toEqual(['.nse\\:control\\=button.nse\\:hovered .nse\\:part\\=bezel:not(.nse\\:enabled\\=false)']);
    expect(weight(out[0])).toBe(weight(original));
  });

  it("keeps the attribute form where a class cannot say the same thing", () => {
    // Values that are not class tokens, other operators, case flags and data-carrying attributes.
    for (const kept of ['[data-nse-key-equivalent=" "]', '[data-nse-style=""]', '[data-nse-style~="a"]', '[data-nse-style^="a"]', '[data-nse-style="a"i]', '[data-nse-toolbar-item-id="x"]', '[data-state="on"]']) {
      expect(selectors(optimiseSelectors(`${kept} { color: red }`)), kept).toEqual([kept]);
    }
  });

  it("leaves almost no contract hook in the Atmo bundle as an attribute selector", () => {
    const resources = resolve(import.meta.dirname, "../../src/Themes/Atmo.scostheme/Contents/Resources");
    let before = 0, after = 0;
    for (const file of readdirSync(resources).filter((name) => name.endsWith(".css"))) {
      const source = readFileSync(resolve(resources, file), "utf8");
      before += source.match(/\[data-nse-(?:control|part)[=\]]/gu)?.length ?? 0;
      after += optimiseSelectors(source).match(/\[data-nse-(?:control|part)[=\]]/gu)?.length ?? 0;
    }
    expect(before).toBeGreaterThan(10_000);
    expect(after).toBeLessThan(before / 100);
  }, 120_000);
});
