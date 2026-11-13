import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// A fixed 50px field inside a mini slider overhangs it, and a vertical one then widens whatever scrolls around it.
it("sizes the slider's range field from the control size, at every control size", () => {
  const css = readFileSync("src/Themes/Atmo.scostheme/Contents/Resources/atmo-structure.values.css", "utf8");
  const rules = css.split("}").filter(rule => /\[data-nse-slider-type="linear"\]\)\)? \[data-nse-part="field"\](?:::-(?:webkit-slider-runnable-track|webkit-slider-thumb|moz-range-track|moz-range-thumb))? \{/u.test(rule));
  const heights = rules.flatMap(rule => [...rule.matchAll(/(?:^|[\s;{])height:([^;]+);/gu)].map(match => match[1]!.trim()));
  expect(heights.length).toBe(5);
  for (const height of heights) expect(height).toBe("var(--nse-control-slider-control-size, 50px)");
});
