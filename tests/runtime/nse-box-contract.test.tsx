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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { NSEBox } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSE } from "../../src/NSE/NSE";

afterEach(cleanup);

describe("NSEBox", () => {
  it("preserves grouping semantics across every NSBox title position", () => {
    const positions = [
      ["noTitle", "none"],
      ["aboveTop", "above-top"],
      ["atTop", "at-top"],
      ["belowTop", "below-top"],
      ["aboveBottom", "above-bottom"],
      ["atBottom", "at-bottom"],
      ["belowBottom", "below-bottom"],
    ] as const;

    for (const [titlePosition, attribute] of positions) {
      const { unmount } = render(
        <NSEBox title="Account" titlePosition={titlePosition} boxType="primary" borderType="bezelBorder">
          <input aria-label="Username" />
        </NSEBox>,
      );
      const box = screen.getByRole("group", { name: "Account" });
      expect(box.getAttribute("data-title-position")).toBe(attribute);
      expect(box.getAttribute("data-box-kind")).toBe("primary");
      expect(box.getAttribute("data-border-style")).toBe("bezel");
      if (titlePosition === "noTitle") {
        expect(screen.getByText("Account").classList.contains("nse-control-visually-hidden")).toBe(true);
      }
      unmount();
    }
  });

  it("publishes every box type and border type as a stable appearance key", () => {
    const boxTypes = ["primary", "secondary", "custom"] as const;
    const borderTypes = [["noBorder", "none"], ["lineBorder", "line"], ["bezelBorder", "bezel"], ["grooveBorder", "groove"]] as const;
    for (const boxType of boxTypes) {
      for (const [borderType, border] of borderTypes) {
        const { unmount } = render(<NSEBox aria-label={`${boxType}-${borderType}`} boxType={boxType} borderType={borderType} />);
        const box = screen.getByRole("group", { name: `${boxType}-${borderType}` });
        expect(box.getAttribute("data-appearance-recipe")).toBe(`box.${boxType}.${border}.none`);
        unmount();
      }
    }
  });

  it("validates fillColour and contentViewMargins before exposing CSS variables", () => {
    render(
      <NSEBox
        aria-label="Custom"
        boxType="custom"
        fillColour="linear-gradient(#fff, #ddd)"
        contentViewMargins={{ width: 6, height: 3 }}
      />,
    );
    const box = screen.getByRole("group", { name: "Custom" });
    const style = box.getAttribute("style") ?? "";
    expect(style).toContain("--nse-box-fill: linear-gradient(#fff, #ddd)");
    expect(style).toContain("--nse-box-inset-top: 3px");
    expect(style).toContain("--nse-box-inset-right: 6px");
    expect(style).toContain("--nse-box-inset-bottom: 3px");
    expect(style).toContain("--nse-box-inset-left: 6px");
    expect(box.getAttribute("data-nse-layout-margins")).toBeNull();

    expect(() => render(<NSEBox aria-label="Bad fill" fillColour="red; color: blue" />)).toThrow(/fillColour/i);
    expect(() => render(<NSEBox aria-label="Bad margin" contentViewMargins={{ width: -1, height: 0 }} />)).toThrow(/contentViewMargins/i);
    expect(() => render(<NSEBox aria-label="Infinite margin" contentViewMargins={{ width: 0, height: Infinity }} />)).toThrow(/contentViewMargins/i);
  });

  it("draws a separator box and rejects separator children", () => {
    render(<NSEBox aria-label="Section break" boxType="separator" titlePosition="noTitle" />);
    expect(screen.getByRole("separator", { name: "Section break" }).getAttribute("data-box-kind")).toBe("separator");
    expect(() => render(<NSEBox boxType="separator"><span>Not allowed</span></NSEBox>)).toThrow(/separator.*children/i);
  });

  it("draws a titled separator as the theme's captioned separator", () => {
    render(<NSEBox boxType="separator" title="Built with" className="consumer-separator" />);
    const separator = screen.getByRole("separator", { name: "Built with" });
    expect(separator.classList.contains("nse-box-separator-titled")).toBe(true);
    expect(separator.classList.contains("consumer-separator")).toBe(true);
    expect(separator.textContent).toBe("Built with");
  });

  it("titles a primary box at the top by default", () => {
    render(<NSEBox title="Advanced"><button>Reset</button></NSEBox>);
    const box = screen.getByRole("group", { name: "Advanced" });
    expect(box.getAttribute("data-title-position")).toBe("at-top");
    expect(box.getAttribute("data-box-kind")).toBe("primary");
    expect(box.classList.contains("nse-control-group-box")).toBe(true);
    expect(box.classList.contains("is-labeled")).toBe(true);
    expect(NSE.NSEBox).toBe(NSEBox);
  });
});
