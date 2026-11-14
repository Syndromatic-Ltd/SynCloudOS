import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// The picker toolbar is itself a tab-view part. A wrapper rule that also matched it tied with the toolbar's row layout, so stylesheet order decided the result.
it("collapses only the colour panel's tab view wrapper, never its picker toolbar", () => {
  const css = readFileSync("src/NSE/Structure/controls.css", "utf8");
  const rule = css.slice(0, css.indexOf("display: contents;", css.indexOf('[data-nse-control="colour-panel"]>fieldset')));
  const selectors = rule.slice(rule.lastIndexOf("}") + 1).split(",").map(selector => selector.trim()).filter(selector => selector.includes('"tab-view"'));
  expect(selectors.length).toBe(2);
  for (const selector of selectors) expect(selector).toMatch(/\[data-nse-control="tab-view"\]:where\(\[data-nse-part="background"\]\)(?: \{)?$/);
});
