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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const VECTOR = "src/NSE/Themes/Atmo/Resources/atmo.css";

/** Guards the committed Atmo vector material and accessible paint fallbacks. */
describe("Atmo vector coverage", () => {
  const readVectorCss = () => readFileSync(path.join(process.cwd(), VECTOR), "utf8").replace(/\r\n?/gu, "\n");

  it("never lets a raster Atmo sprite into atmo-vector.css itself", () => {
    const css = readVectorCss();
    // Strip comments first — section headers legitimately name the sprites they
    // replaced, and matching those would make this assertion unpassable.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const leaks = [...code.matchAll(/url\(\s*["']?(\/assets\/nse\/atmo\/[^"')]+)/g)].map((m) => m[1]);
    expect(leaks).toEqual([]);
  });

  it("keeps NSETabBar's tall grouped-toolbutton variant on its three canonical atomic layers", () => {
    const css = readVectorCss();
    const generatedBlock = css.slice(
      css.indexOf("/* Atmo tall tab material. */"),
      css.indexOf("/* End tall tab material. */"),
    );

    expect(css).toContain("[data-nse-appearance=\"atmo\"] .nse-tab-bar.nse-control-toolbar[data-grouped=\"true\"][data-nse-tab-chrome-active=\"true\"][data-nse-tab-chrome-size=\"tall\"]");
    for (const segment of ["first", "middle", "last", "only"]) {
      for (const state of ["up", "down", "sel", "seldown", "dis"]) {
        for (const piece of ["start", "body", "end"]) {
          expect(css).toContain(`--nse-atmo-svg-nse-tab-atmo-${segment}-${state}-${piece}: url(\"data:image/svg+xml,`);
        }
      }
    }
    expect(generatedBlock).toContain("border-image-source: none;");
    expect(generatedBlock).not.toMatch(/border-image(?:-source)?:\s*(?:var\(|url\()/i);
    expect(generatedBlock).toContain("filter: none;");
    expect(generatedBlock).toContain("background-image: var(--nse-tab-chrome-body);");
    expect(generatedBlock).toContain("background-image: var(--nse-tab-chrome-start);");
    expect(generatedBlock).toContain("background-image: var(--nse-tab-chrome-end);");
    expect(generatedBlock).toContain("padding-inline-start: var(--nse-tab-chrome-start-width);");
    expect(generatedBlock).toContain("padding-inline-end: var(--nse-tab-chrome-end-width);");
    expect(generatedBlock).not.toMatch(/padding-(?:left|right):\s*var\(--nse-tab-chrome-(?:start|end)-width\)/);
    expect(generatedBlock).toContain("--nse-tab-chrome-outer-cap: 36px;");
    expect(generatedBlock).toContain("--nse-tab-chrome-join: 1.714286px;");
    expect(generatedBlock).toContain("--nse-tab-chrome-elevation: 0 16px 20px rgba(0, 0, 0, 0.48);");
    expect(generatedBlock).toContain("-webkit-backdrop-filter: blur(6px) saturate(1.25);");
    expect(generatedBlock).toContain("backdrop-filter: blur(6px) saturate(1.25);");
    for (const state of ["up", "down", "sel", "seldown", "dis"]) {
      expect(generatedBlock).toMatch(new RegExp(
        `:first-child:not\\(:last-child\\):dir\\(rtl\\)[^{]*\\{[\\s\\S]*?--nse-tab-chrome-start: var\\(--nse-atmo-svg-nse-tab-atmo-last-${state}-end\\);[\\s\\S]*?--nse-tab-chrome-body: var\\(--nse-atmo-svg-nse-tab-atmo-last-${state}-body\\);[\\s\\S]*?--nse-tab-chrome-end: var\\(--nse-atmo-svg-nse-tab-atmo-last-${state}-start\\);`,
      ));
      expect(generatedBlock).toMatch(new RegExp(
        `:last-child:not\\(:first-child\\):dir\\(rtl\\)[^{]*\\{[\\s\\S]*?--nse-tab-chrome-start: var\\(--nse-atmo-svg-nse-tab-atmo-first-${state}-end\\);[\\s\\S]*?--nse-tab-chrome-body: var\\(--nse-atmo-svg-nse-tab-atmo-first-${state}-body\\);[\\s\\S]*?--nse-tab-chrome-end: var\\(--nse-atmo-svg-nse-tab-atmo-first-${state}-start\\);`,
      ));
    }

    // The shared toolbar recipe is a separately-owned 50px control contract.
    // Its exact vector inputs stay pinned while NSETabBar uses a tall variant.
    const sharedGtVectors = ["first", "middle", "last", "only"].flatMap((segment) =>
      ["up", "down", "sel", "seldown", "dis"].map((state) => {
        const match = css.match(new RegExp(`--nse-atmo-svg-gt-${segment}-${state}: url\\(\"([^\"]+)\"\\);`));
        expect(match, `missing shared gt ${segment}.${state}`).not.toBeNull();
        return match![1];
      }),
    );
    expect(createHash("sha256").update(sharedGtVectors.join("\n")).digest("hex"))
      .toBe("4bb18d3e9313187ed2225d123a300c482fcbabc4bcd598b90c63b82e2457014d");

    // The tab-only variant preserves the shared dark gt control's caption
    // paint rather than inheriting the unrelated light-radio tab-label token.
    expect(css).toContain(
      "[data-nse-appearance=\"atmo\"] .nse-tab-bar.nse-control-toolbar[data-grouped=\"true\"][data-nse-tab-chrome-active=\"true\"][data-nse-tab-chrome-size=\"tall\"] > .nse-tab-bar-tab.nse-control-button > .nse-tab-bar-content > .nse-tab-bar-label {\n  color: inherit;\n}",
    );
  });

  it("gives only NSETabBar exact 72px atomic vector caps without stretching the shared 50px gt geometry", () => {
    const css = readVectorCss();
    const tabVector = (segment: "first" | "middle" | "last" | "only", piece: "start" | "body" | "end") => {
      const match = css.match(new RegExp(`--nse-atmo-svg-nse-tab-atmo-${segment}-up-${piece}: url\\(\\\"([^\\\"]+)\\\"\\);`));
      expect(match, `missing tall tab vector for ${segment}.${piece}`).not.toBeNull();
      return decodeURIComponent(match![1]);
    };

    const first = tabVector("first", "start");
    const middle = tabVector("middle", "body");
    const last = tabVector("last", "end");
    const onlyStart = tabVector("only", "start");
    const onlyEnd = tabVector("only", "end");

    // The shared recipe's visible material lives between y=4 and y=46. The
    // tab-specific recipe crops that vector-native material before uniformly
    // scaling it to 72px; it must never fake the taller silhouette with a
    // non-uniform background/image scale. 21 × (72 / 42) is the 36px cap.
    // The outer source viewports are cropped to each canonical gt vector's
    // usable bounds. Extending them into the source's clipped overscan would
    // reintroduce a transparent gap at the adjacent tab segment.
    expect(first).toContain("width='36' height='72'");
    expect(middle).toContain("height='72'");
    expect(last).toContain("width='36' height='72'");
    expect(onlyStart).toContain("width='36' height='72'");
    expect(onlyEnd).toContain("width='36' height='72'");

    // These are path/rect clipping primitives in the generated Atmo vector
    // recipe.  They own NSETabBar's exact circles while the untouched gt
    // source remains the material/state provider.
    expect(first).toContain("id='nse-tab-vector-clip'");
    expect(first).toContain("A21 21 0 0 1 25 4");
    expect(last).toContain("A21 21 0 0 1 26 46");
    expect(onlyStart).toContain("A21 21");
    expect(onlyEnd).toContain("A21 21");
  });

  it("contains every atomic outer-cap paint inside an alpha-guarded canonical arc", () => {
    const css = readVectorCss();
    const guards = {
      resting: {
        first: "M25 4H50V46H25V45.75A20.75 20.75 0 0 1 25 4.25V4Z",
        middle: "<rect x='0' y='4' width='51' height='42' fill='white'/>",
        last: "M1 4H26V4.25A20.75 20.75 0 0 1 26 45.75V46H1Z",
        only: "M25 4H26V4.25A20.75 20.75 0 0 1 26 45.75V46H25V45.75A20.75 20.75 0 0 1 25 4.25V4Z",
      },
      // 43/64 source units is the smallest measured held-state guard that
      // survives fractional Chromium and WebKit layouts through DPR3.
      held: {
        first: "M25 4H50V46H25V45.328125A20.328125 20.328125 0 0 1 25 4.671875V4Z",
        middle: "<rect x='0' y='4' width='51' height='42' fill='white'/>",
        last: "M1 4H26V4.671875A20.328125 20.328125 0 0 1 26 45.328125V46H1Z",
        only: "M25 4H26V4.671875A20.328125 20.328125 0 0 1 26 45.328125V46H25V45.328125A20.328125 20.328125 0 0 1 25 4.671875V4Z",
      },
    } as const;

    for (const segment of ["first", "middle", "last", "only"] as const) {
      for (const state of ["up", "down", "sel", "seldown", "dis"] as const) {
        const guardedGeometry = state === "down" || state === "seldown" ? guards.held : guards.resting;
        for (const piece of ["start", "body", "end"] as const) {
          const match = css.match(new RegExp(`--nse-atmo-svg-nse-tab-atmo-${segment}-${state}-${piece}: url\\(\"([^\"]+)\"\\);`));
          expect(match, `missing atomic ${segment}.${state}.${piece}`).not.toBeNull();
          const svg = decodeURIComponent(match![1]);
          expect(svg).toContain("id='nse-tab-vector-mask'");
          expect(svg).toContain("maskUnits='userSpaceOnUse'");
          expect(svg).toContain("maskContentUnits='userSpaceOnUse'");
          expect(svg).toContain("mask-type='alpha'");
          expect(svg).toContain("<g clip-path='url(#nse-tab-vector-clip)' mask='url(#nse-tab-vector-mask)'>");
          expect(svg).toContain(guardedGeometry[segment]);
        }
      }
    }
  });

  it("keeps blur and deep elevation on the inert shared layer with accessibility fallbacks", () => {
    const navigationCss = readFileSync(path.join(process.cwd(), "src/NSE/Navigation/nse-navigation.css"), "utf8");

    expect(navigationCss).toMatch(/@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.nse-tab-bar::before[\s\S]*?-webkit-backdrop-filter:\s*none[\s\S]*?backdrop-filter:\s*none/u);
    expect(navigationCss).toMatch(/@media \(forced-colors: active\)[\s\S]*?\.nse-tab-bar::before[\s\S]*?box-shadow:\s*none/u);
    expect(navigationCss).toMatch(/@media \(forced-colors: active\)[\s\S]*?\.nse-tab-bar::before[\s\S]*?backdrop-filter:\s*none/u);

  });

});
