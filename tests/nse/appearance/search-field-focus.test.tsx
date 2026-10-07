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

// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
import * as cssTree from "css-tree";
import { afterEach, describe, expect, it } from "vitest";
import { NSESearchField, type NSESearchFieldProps } from "../../../src/NSE/Controls/Fields/NSESearchField";

const atmoCss = readFileSync("src/NSE/Themes/Atmo/Resources/atmo.css", "utf8");
const appearanceCss = readFileSync("src/NSE/Appearance/nse-appearance.css", "utf8");
const fieldCss = readFileSync("src/NSE/Controls/Fields/nse-field-extensions.css", "utf8");
const structureCss = readFileSync("src/NSE/Themes/Atmo/Resources/atmo-structure.css", "utf8");

// Keep the real search selectors, declaration order and media conditions,
// without mounting unrelated controls or the theme's large SVG data URLs.
function searchPaint(css: string) {
  const ast = cssTree.parse(css);
  cssTree.walk(ast, {
    visit: "Rule",
    enter(node, item, list) {
      if (!cssTree.generate(node.prelude).includes(".nse-control-search") &&
        !node.block.children.some(child => child.type === "Declaration" && child.property === "--nse-atmo-focus-ring")) {
        list.remove(item);
      }
    },
  });
  return cssTree.generate(ast);
}
const paint = appearanceCss + fieldCss + searchPaint(structureCss) + searchPaint(atmoCss);

afterEach(cleanup);

function mount(props: NSESearchFieldProps = {}, contrast = "normal") {
  const { container } = render(<>
    <style>{paint}</style>
    <div data-nse-appearance="atmo" data-nse-contrast={contrast}>
      <NSESearchField aria-label="Find" {...props} />
    </div>
    <button>Outside</button>
  </>);
  const input = screen.getByRole("searchbox", { name: "Find" }) as HTMLInputElement;
  const frame = container.querySelector(".nse-control-search-frame") as HTMLElement;
  return { input, frame };
}

function focus(element: HTMLElement, frame: HTMLElement) {
  act(() => element.focus());
  // JSDOM caches compound :focus-within selectors across focus changes.
  // Reapply the unchanged class to invalidate that cache before reading paint.
  frame.className = frame.className;
}

describe("Atmo search-field focus paint", () => {
  it.each([
    { name: "regular", props: {} },
    { name: "small", props: { controlSize: "small" as const } },
    { name: "custom height", props: { height: 36 } },
    { name: "read-only", props: { readOnly: true, defaultValue: "Read this" } },
  ])("paints one capsule glow on the $name wrapper, preserving its focus art", ({ props }) => {
    const { input, frame } = mount(props);
    expect(getComputedStyle(frame).boxShadow).toBe("none");
    focus(input, frame);
    expect(document.activeElement).toBe(input);
    expect(frame.matches(":focus-within")).toBe(true);
    const focused = getComputedStyle(frame);
    expect(focused.boxShadow).toBe("var(--nse-atmo-focus-ring)");
    expect(focused.borderRadius).toBe("999px");
    expect(focused.borderImage).toContain("var(--nse-atmo-svg-si-only-focus)");
    expect(getComputedStyle(input).outline).toMatch(/^(none|0(?:px)?)$/);
    expect(getComputedStyle(input).boxShadow).toBe("none");
    focus(screen.getByRole("button", { name: "Outside" }), frame);
    expect(getComputedStyle(frame).boxShadow).toBe("none");
  });

  it("does not paint a disabled field even if another descendant receives focus", () => {
    const { input, frame } = mount({ disabled: true });
    focus(input, frame);
    expect(document.activeElement).not.toBe(input);
    frame.tabIndex = 0;
    focus(frame, frame);
    expect(frame.matches(":focus-within")).toBe(true);
    expect(getComputedStyle(frame).boxShadow).toBe("none");
  });

  it.each([
    { contrast: "high", width: "3px", colour: "var(--nse-contrast-accent)" },
    { contrast: "forced", width: "2px", colour: "highlight" },
  ])("moves the $contrast contrast focus outline onto the capsule", ({ contrast, width, colour }) => {
    const { input, frame } = mount({ height: 36 }, contrast);
    focus(input, frame);
    const focused = getComputedStyle(frame);
    expect(focused.borderRadius).toBe("999px");
    expect(focused.outline).toBe(`${width} solid ${colour}`);
    expect(focused.boxShadow).toBe("none");
    expect(getComputedStyle(input).outline).toMatch(/^(none|0(?:px)?)$/);
    expect(getComputedStyle(input).boxShadow).toBe("none");
  });

  it("provides a system-colour capsule outline when forced colours suppress shadows", () => {
    const ast = cssTree.parse(atmoCss);
    const forcedRules: { selector: string; declarations: Record<string, string> }[] = [];
    let forcedDepth = 0;
    cssTree.walk(ast, {
      enter(node) {
        if (node.type === "Atrule" && node.name === "media" && node.prelude && cssTree.generate(node.prelude) === "(forced-colors:active)") forcedDepth++;
        if (node.type !== "Rule" || !forcedDepth || !cssTree.generate(node.prelude).includes(".nse-control-search-frame")) return;
        const declarations: Record<string, string> = {};
        node.block.children.forEach(child => {
          if (child.type === "Declaration") declarations[child.property] = cssTree.generate(child.value);
        });
        forcedRules.push({ selector: cssTree.generate(node.prelude), declarations });
      },
      leave(node) {
        if (node.type === "Atrule" && node.name === "media" && node.prelude && cssTree.generate(node.prelude) === "(forced-colors:active)") forcedDepth--;
      },
    });
    const { input, frame } = mount({ height: 36 });
    focus(input, frame);
    expect(forcedRules.filter(rule => frame.matches(rule.selector)).map(rule => rule.declarations)).toContainEqual(
      expect.objectContaining({ outline: "2px solid Highlight", "outline-offset": "2px", "box-shadow": "none" }),
    );
  });
});
