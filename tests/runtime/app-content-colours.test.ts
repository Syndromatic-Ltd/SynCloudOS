/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/** The declarations of every rule whose selector is exactly `selector`, merged in source order. */
function block(css: string, selector: string): Map<string, string> {
  const values = new Map<string, string>();
  let found = false;
  for (let start = css.indexOf(`${selector} {`); start >= 0; start = css.indexOf(`${selector} {`, start + 1)) {
    found = true;
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)) values.set(match[1]!, match[2]!.trim());
  }
  expect(found, `rule ${selector}`).toBe(true);
  return values;
}

/** The colour tokens the appearance guide documents for application content. */
const documented = [...read("docs/framework/appearance.md").matchAll(/^\| `(--nse-colour-[\w-]+)` \|/gmu)].map(match => match[1]!);

const srgb = (hex: string) => [1, 3, 5].map(index => {
  const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});
const luminance = (hex: string) => { const [r, g, b] = srgb(hex); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const contrast = (a: string, b: string) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high! + 0.05) / (low! + 0.05); };

describe("application content colours", () => {
  it("documents the full shared set", () => {
    expect(documented).toEqual([
      "--nse-colour-window-background", "--nse-colour-label", "--nse-colour-secondary-label", "--nse-colour-control-background",
      "--nse-colour-grid", "--nse-colour-separator", "--nse-colour-control-accent", "--nse-colour-selected-control-text",
      "--nse-colour-selected-content-background", "--nse-colour-system-red",
    ]);
  });

  it("gives every documented token a theme-neutral light and dark default", () => {
    const css = read("src/NSE/Appearance/nse-appearance.css");
    for (const scheme of ["light", "dark"]) {
      const values = block(css, `:where([data-nse-colour-scheme-resolved="${scheme}"])`);
      for (const token of documented) expect(values.has(token), `${token} (${scheme})`).toBe(true);
    }
  });

  it("lets Atmo define every token it draws differently, in light and dark", () => {
    const css = read("src/NSE/Themes/Atmo/Resources/atmo.css");
    const light = block(css, '[data-nse-appearance="atmo"]');
    const dark = block(css, '[data-nse-appearance="atmo"][data-mode="dark"],\n[data-nse-appearance="atmo"] [data-mode="dark"]');
    const themed = documented.filter(token => token !== "--nse-colour-window-background" && token !== "--nse-colour-label");
    for (const token of themed) {
      expect(light.has(token), `Atmo light ${token}`).toBe(true);
      expect(dark.has(token), `Atmo dark ${token}`).toBe(true);
    }
  });

  it("keeps the neutral text colours readable on the app background", () => {
    const css = read("src/NSE/Appearance/nse-appearance.css");
    for (const scheme of ["light", "dark"]) {
      const values = block(css, `:where([data-nse-colour-scheme-resolved="${scheme}"])`);
      const background = values.get("--nse-colour-window-background")!;
      for (const token of ["--nse-colour-label", "--nse-colour-secondary-label", "--nse-colour-system-red"]) {
        expect(contrast(values.get(token)!, background), `${token} (${scheme})`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(values.get("--nse-colour-control-accent")!, background), `accent (${scheme})`).toBeGreaterThanOrEqual(3);
      expect(contrast(values.get("--nse-colour-selected-control-text")!, values.get("--nse-colour-control-accent")!), `accent foreground (${scheme})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
