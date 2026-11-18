// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEButton } from "../../../src/NSE/Controls/Buttons/NSEButton";
import { NSEPopUpButton } from "../../../src/NSE/Menus/NSEPopUpButton";
import { NSESegmentedControl } from "../../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSEToolbar } from "../../../src/NSE/Toolbars/NSEToolbar";

const bezel = "#c8102e";
const tint = "#106aca";
const segments = {
  "aria-label": "View",
  items: [{ id: "list", label: "List" }, { id: "grid", label: "Grid" }],
  selection: { mode: "select-one" as const, selectedIds: new Set(["list"]), allowsEmpty: false },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("control colour properties", () => {
  it("projects bezel and tint colours on push and pop-up buttons", () => {
    const { container } = render(<>
      <NSEButton title="Save" bezelColour={bezel} contentTintColour={tint} />
      <NSEPopUpButton accessibleLabel="Order" items={[{ value: "name", title: "Name" }]} bezelColour={bezel} contentTintColour={tint} />
    </>);
    for (const control of ["button", "pop-up-button"]) {
      const element = container.querySelector<HTMLElement>('[data-nse-control="' + control + '"]');
      expect(element?.style.getPropertyValue("--nse-bezel-colour")).toBe(bezel);
      expect(element?.style.getPropertyValue("--nse-content-tint-colour")).toBe(tint);
    }
  });

  it.each(["rounded", "texturedRounded"] as const)("projects the selected bezel for %s segments", segmentStyle => {
    const { container } = render(<NSESegmentedControl {...segments} segmentStyle={segmentStyle} selectedSegmentBezelColour={bezel} />);
    const root = container.querySelector<HTMLElement>('[data-nse-control="segmented-control"]');
    expect(root?.style.getPropertyValue("--nse-selected-segment-bezel-colour")).toBe(bezel);
  });

  it.each([
    ["bezelColour", () => <NSEButton title="Save" bezelColour="url(x)" />],
    ["contentTintColour", () => <NSEButton title="Save" contentTintColour="url(x)" />],
    ["bezelColour", () => <NSEPopUpButton bezelColour="url(x)" items={[]} />],
    ["contentTintColour", () => <NSEPopUpButton contentTintColour="url(x)" items={[]} />],
    ["selectedSegmentBezelColour", () => <NSESegmentedControl {...segments} selectedSegmentBezelColour="url(x)" />],
  ] as const)("rejects non-colours supplied for %s", (name, element) => {
    const supports = vi.fn(() => false);
    vi.stubGlobal("CSS", { supports });
    expect(() => render(element())).toThrow(TypeError);
    expect(supports).toHaveBeenCalledWith("color", "url(x)");
  });

  it("validates backgroundTintColour on a configured toolbar item", () => {
    const supports = vi.fn(() => false);
    vi.stubGlobal("CSS", { supports });
    expect(() => new NSEToolbar({
      identifier: "example",
      defaultItemIdentifiers: ["save"],
      items: [{ kind: "command", id: "save", commandId: "save", label: "Save", paletteLabel: "Save", icon: "S", backgroundTintColour: "url(x)" }],
    })).toThrow(TypeError);
    expect(supports).toHaveBeenCalledWith("color", "url(x)");
  });
});
