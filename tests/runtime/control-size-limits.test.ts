import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("leaves a control's minimum size as a default an app stylesheet can override", () => {
  const limits = readFileSync(join(process.cwd(), "src", "NSE", "Structure", "limits.css"), "utf8");
  const minima = limits.split(/\r?\n/u).filter(line => /^\s*min-(?:inline|block)-size:\s*max\(24px, var\(--nse-control-minimum-/u.test(line));
  expect(minima).toHaveLength(2);
  // An important declaration in a layer beats unlayered app CSS, which locked every control at its themed size.
  for (const line of minima) expect(line).not.toContain("!important");
});
