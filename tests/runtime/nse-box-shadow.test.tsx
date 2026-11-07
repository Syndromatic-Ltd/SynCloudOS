// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEBox } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSEView } from "../../src/NSE/Views/NSEView";
import { NSEShadow } from "../../src/NSE/Graphics/NSEShadow";
import { NSEAppearance } from "../../src/NSE/Appearance/NSEAppearance";
import * as SDK from "../../src/NSE/sdkPackageEntry";
import { readFileSync } from "node:fs";

afterEach(cleanup);

describe("NSShadow values and view properties", () => {
  it("copies and freezes AppKit's size offset and rejects invalid values", () => {
    const offset = { width: 2, height: -3 };
    const shadow = new NSEShadow({ shadowColor: "#1238", shadowOffset: offset, shadowBlurRadius: 6 });
    offset.width = 99;
    expect(shadow.shadowOffset).toEqual({ width: 2, height: -3 });
    expect(Object.isFrozen(shadow)).toBe(true);
    expect(Object.isFrozen(shadow.shadowOffset)).toBe(true);
    expect(new NSEShadow().shadowBlurRadius).toBe(0);
    expect(() => new NSEShadow({ shadowBlurRadius: -1 })).toThrow(/shadowBlurRadius/);
    expect(() => new NSEShadow({ shadowOffset: { width: NaN, height: 0 } })).toThrow(/shadowOffset/);
    expect(() => new NSEShadow({ shadowColor: "red;display:none" })).toThrow(/shadowColor/);
  });

  it("projects a shadow onto the view itself, without clipping focus or leaking props", () => {
    const shadow = new NSEShadow({ shadowColor: "#1238", shadowOffset: { width: 2, height: -3 }, shadowBlurRadius: 6 });
    const { rerender } = render(<NSEView data-testid="view" shadow={shadow} cornerRadius={12} cornerCurve="continuous"><button>Focus</button></NSEView>);
    const view = screen.getByTestId("view");
    expect(view.dataset.nseShadow).toBe("true");
    expect(view.dataset.cornerCurve).toBe("continuous");
    expect(view.style.getPropertyValue("--nse-shadow-offset-y")).toBe("3px");
    expect(view.style.getPropertyValue("--nse-corner-radius")).toBe("12px");
    expect(view.style.clipPath).toBe("");
    expect(view.hasAttribute("shadow")).toBe(false);
    expect(view.hasAttribute("cornerRadius")).toBe(false);
    rerender(<NSEView data-testid="view" shadow={null} />);
    expect(view.dataset.nseShadow).toBeUndefined();
    expect(view.style.getPropertyValue("--nse-shadow-colour")).toBe("");
  });

  it("inherits shadow suppression from NSView.appearance", () => {
    render(<NSEView data-testid="view" shadow={new NSEShadow()} appearance={new NSEAppearance("aqua", { transparency: "reduced" })} />);
    expect(screen.getByTestId("view").dataset.nseShadowSuppressed).toBe("true");
  });

  it("removes the three theme components from the SDK without aliases", () => {
    for (const name of ["NSERoundedBox", "NSEShadowView", "NSESmoothSurface"]) expect(name in SDK).toBe(false);
    expect(SDK.NSEShadow).toBe(NSEShadow);
  });
});

describe("custom NSBox property projection for themes", () => {
  it("lets Atmo CSS select the well, frame and floating recipes from real box properties", () => {
    const sheet = document.createElement("style");
    sheet.textContent = readFileSync("src/NSE/Themes/Atmo/Resources/atmo.css", "utf8");
    document.head.append(sheet);
    try {
      render(<div data-nse-appearance="atmo">
        <NSEBox aria-label="Well" boxType="custom" />
        <NSEBox aria-label="Frame" boxType="custom" borderType="lineBorder" />
        <NSEBox aria-label="Floating" boxType="custom" shadow={new NSEShadow()} />
        <NSEBox aria-label="Override" boxType="custom" borderWidth={2} borderColor="#123" />
      </div>);
      expect(getComputedStyle(screen.getByRole("group", { name: "Well" })).borderImage).toContain("--nse-atmo-roundy-shadow");
      expect(getComputedStyle(screen.getByRole("group", { name: "Well" })).margin).toBe("0px");
      expect(getComputedStyle(screen.getByRole("group", { name: "Frame" })).borderImage).toContain("--nse-atmo-rb-frame");
      expect(getComputedStyle(screen.getByRole("group", { name: "Floating" })).borderImage).toContain("--nse-atmo-rb-shadow");
      expect(getComputedStyle(screen.getByRole("group", { name: "Override" })).borderImage).toBe("none");
    } finally { sheet.remove(); }
  });

  it("publishes properties without choosing an Atmo look in JavaScript", () => {
    render(<NSEBox aria-label="Plate" boxType="custom" borderType="lineBorder" borderColor="#123" borderWidth={2} fillColor="#fff" cornerRadius={10} cornerCurve="continuous" isTransparent contentViewMargins={{ width: 5, height: 3 }} shadow={new NSEShadow({ shadowBlurRadius: 8 })}>Content</NSEBox>);
    const box = screen.getByRole("group", { name: "Plate" });
    expect(box.dataset.boxKind).toBe("custom");
    expect(box.dataset.borderStyle).toBe("line");
    expect(box.dataset.nseShadow).toBe("true");
    expect(box.dataset.transparent).toBe("true");
    expect(box.style.getPropertyValue("--nse-box-border-colour")).toBe("#123");
    expect(box.style.getPropertyValue("--nse-box-border-width")).toBe("2px");
    expect(box.style.getPropertyValue("--nse-box-inset-left")).toBe("5px");
    expect(box.style.getPropertyValue("--nse-corner-radius")).toBe("10px");
    expect(box.hasAttribute("isTransparent")).toBe(false);
  });

  it("accepts zero geometry and rejects invalid border and corner values", () => {
    render(<NSEBox aria-label="Flat" boxType="custom" borderWidth={0} cornerRadius={0} />);
    expect(screen.getByRole("group").style.getPropertyValue("--nse-box-border-width")).toBe("0px");
    expect(() => render(<NSEBox borderWidth={-1} />)).toThrow(/borderWidth/);
    expect(() => render(<NSEBox cornerRadius={Infinity} />)).toThrow(/cornerRadius/);
    expect(() => render(<NSEBox borderColor="red; color: blue" />)).toThrow(/borderColor/);
  });
});
