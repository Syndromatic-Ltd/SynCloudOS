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

import { NSEBox, NSEGroupBox } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSE } from "../../src/NSE/NSE";

afterEach(cleanup);

describe("NSEBox", () => {
  it("preserves grouping semantics across every supported title position", () => {
    const positions = [
      "none",
      "above-top",
      "at-top",
      "below-top",
      "above-bottom",
      "at-bottom",
      "below-bottom",
    ] as const;

    for (const titlePosition of positions) {
      const { unmount } = render(
        <NSEBox title="Account" titlePosition={titlePosition} kind="primary" border="bezel">
          <input aria-label="Username" />
        </NSEBox>,
      );
      const box = screen.getByRole("group", { name: "Account" });
      expect(box.getAttribute("data-title-position")).toBe(titlePosition);
      expect(box.getAttribute("data-box-kind")).toBe("primary");
      expect(box.getAttribute("data-border-style")).toBe("bezel");
      if (titlePosition === "none") {
        expect(screen.getByText("Account").classList.contains("nse-control-visually-hidden")).toBe(true);
      }
      unmount();
    }
  });

  it("publishes every kind and border as a stable appearance key", () => {
    const kinds = ["primary", "secondary", "legacy", "custom"] as const;
    const borders = ["none", "line", "bezel", "groove"] as const;
    for (const kind of kinds) {
      for (const border of borders) {
        const { unmount } = render(<NSEBox aria-label={`${kind}-${border}`} kind={kind} border={border} />);
        const box = screen.getByRole("group", { name: `${kind}-${border}` });
        expect(box.getAttribute("data-appearance-recipe")).toBe(`box.${kind}.${border}.none`);
        unmount();
      }
    }
  });

  it("validates custom fill and content insets before exposing CSS variables", () => {
    render(
      <NSEBox
        aria-label="Custom"
        kind="custom"
        fill="linear-gradient(#fff, #ddd)"
        contentInsets={{ top: 1, right: 2, bottom: 3, left: 4 }}
      />,
    );
    const style = screen.getByRole("group", { name: "Custom" }).getAttribute("style") ?? "";
    expect(style).toContain("--nse-box-fill: linear-gradient(#fff, #ddd)");
    expect(style).toContain("--nse-box-inset-top: 1px");
    expect(style).toContain("--nse-box-inset-right: 2px");
    expect(style).toContain("--nse-box-inset-bottom: 3px");
    expect(style).toContain("--nse-box-inset-left: 4px");

    expect(() => render(<NSEBox aria-label="Bad fill" fill="red; color: blue" />)).toThrow(/fill/i);
    expect(() => render(<NSEBox aria-label="Bad inset" contentInsets={{ top: -1, right: 0, bottom: 0, left: 0 }} />)).toThrow(/inset/i);
    expect(() => render(<NSEBox aria-label="Infinite inset" contentInsets={{ top: Infinity, right: 0, bottom: 0, left: 0 }} />)).toThrow(/inset/i);
  });

  it("uses a semantic separator adapter and rejects separator children", () => {
    render(<NSEBox title="Section break" kind="separator" />);
    expect(screen.getByRole("separator", { name: "Section break" }).getAttribute("data-box-kind")).toBe("separator");
    expect(() => render(<NSEBox kind="separator"><span>Not allowed</span></NSEBox>)).toThrow(/separator.*children/i);
  });

  it("keeps NSEGroupBox as a source-compatible NSEBox composition and public export", () => {
    render(<NSEGroupBox label="Advanced"><button>Reset</button></NSEGroupBox>);
    const box = screen.getByRole("group", { name: "Advanced" });
    expect(box.getAttribute("data-title-position")).toBe("at-top");
    expect(box.getAttribute("data-box-kind")).toBe("primary");
    expect(box.classList.contains("nse-control-group-box")).toBe(true);
    expect(box.classList.contains("is-labeled")).toBe(true);
    expect(NSE.NSEBox).toBe(NSEBox);
  });
});
