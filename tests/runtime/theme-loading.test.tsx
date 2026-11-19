// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { NSEAppearance } from "../../src/NSE/Appearance/NSEAppearance";
import { NSEView } from "../../src/NSE/Views/NSEView";
import { ControlImage } from "../../src/NSE/Controls/Images/NSEControlImage";
import { NSEImage } from "../../src/NSE/Controls/Images/NSEImageResource";
import { LoginWindow } from "../../src/NSE/SystemUI/LoginWindow";
import { atmoTheme } from "../../src/NSE/Appearance/atmoTheme";
import atmoDefinition from "../../src/Themes/Atmo.scostheme/Contents/Theme.json";
import { freezeNSETheme } from "../../src/NSE/Theme/NSETheme";
import { nseThemeColourNames, nseThemeColourProperties } from "../../src/NSE/Theme/contract/colours";
afterEach(cleanup);
const outer = freezeNSETheme({ ...atmoTheme, bundleIdentifier: "com.example.outer", displayName: "Outer", colours: { light: Object.fromEntries(nseThemeColourNames.map(name => [name, "#112233"])) as typeof atmoTheme.colours.light, dark: atmoTheme.colours.dark } });
const inner = freezeNSETheme({ ...atmoTheme, bundleIdentifier: "com.example.inner", displayName: "Inner", images: { NSGoBackTemplate: { files: { "1x": "/inner.svg", "2x": "/inner@2x.svg" }, pointSize: { width: 17, height: 19 }, template: true } }, presentation: { ...atmoTheme.presentation, login: "plain" } });
describe("theme boundaries", () => {
  it("resets every semantic colour inside nested appearances without inheriting the outer palette", () => {
    render(<NSEAppearanceProvider theme={outer} colourScheme="light"><span data-testid="outer" /><NSEView appearance={new NSEAppearance("darkAqua", { theme: inner })}><span data-testid="inner" /></NSEView></NSEAppearanceProvider>);
    const outerBoundary = screen.getByTestId("outer").closest<HTMLElement>("[data-nse-theme]")!;
    const innerBoundary = screen.getByTestId("inner").closest<HTMLElement>("[data-nse-theme]")!;
    expect(innerBoundary.dataset.nseTheme).toBe(inner.bundleIdentifier);
    for (const name of nseThemeColourNames) { expect(outerBoundary.style.getPropertyValue(nseThemeColourProperties[name])).toBe(outer.colours.light[name]); expect(innerBoundary.style.getPropertyValue(nseThemeColourProperties[name])).toBe(inner.colours.dark[name]); }
  });
  it("resolves a named image against the view's theme and falls back part by part", () => {
    const image = NSEImage.named(NSEImage.goBackTemplateName)!;
    render(<NSEAppearanceProvider theme={inner}><ControlImage image={image} /></NSEAppearanceProvider>);
    const element = document.querySelector<HTMLElement>('[data-nse-image-template="NSGoBackTemplate"]')!;
    expect(element.style.maskImage).toContain("/inner.svg"); expect(NSEImage.named(image.name, inner)?.files["2x"]).toBe("/inner@2x.svg");
    expect(element.style.width).toBe("17px"); expect(element.style.height).toBe("19px");
  });
  it("registers two density files for every Atmo control image slot", () => {
    const expected = {
      NSRightFacingTriangleTemplate: "disclosure-triangle",
      NSEStepperIncrementTemplate: "stepper-increment",
      NSEStepperDecrementTemplate: "stepper-decrement",
      NSEPopUpButtonChevron: "pop-up-chevron",
      NSTouchBarSearchTemplate: "search-field-magnifier",
      NSESearchFieldCancel: "search-field-cancel",
    };
    for (const name of Object.keys(expected) as Array<keyof typeof expected>) {
      const glyph = expected[name];
      const image = NSEImage.named(name);
      expect(atmoDefinition.images[name].files["1x"]).toContain(glyph + ".svg");
      expect(atmoDefinition.images[name].files["2x"]).toContain(glyph + "@2x.svg");
      expect(image?.files["2x"]).toBeTruthy();
      expect(image?.files["2x"]).not.toBe(image?.files["1x"]);
    }
  });
  it("projects control images from a system theme and fills omitted slots from Atmo", () => {
    const custom = freezeNSETheme({
      ...inner,
      images: {
        NSEPopUpButtonChevron: { files: { "1x": "/chevron.svg", "2x": "/chevron@2x.svg" }, pointSize: { width: 13, height: 7 } },
        NSTouchBarSearchTemplate: { files: { "1x": "/magnifier.svg" }, pointSize: { width: 16, height: 16 }, template: true },
      },
    });
    render(<NSEAppearanceProvider theme={custom} colourScheme="dark">
      <span data-testid="outer-images" />
      <NSEView appearance={new NSEAppearance("aqua", { theme: atmoTheme })}><span data-testid="inner-images" /></NSEView>
    </NSEAppearanceProvider>);
    const outerBoundary = screen.getByTestId("outer-images").closest<HTMLElement>("[data-nse-theme]")!;
    const innerBoundary = screen.getByTestId("inner-images").closest<HTMLElement>("[data-nse-theme]")!;
    expect(outerBoundary.style.getPropertyValue("--nse-image-pop-up-chevron-override")).toBe('image-set(url("/chevron.svg") 1x, url("/chevron@2x.svg") 2x)');
    expect(outerBoundary.style.getPropertyValue("--nse-image-search-field-magnifier")).toBe('url("/magnifier.svg")');
    expect(outerBoundary.style.getPropertyValue("--nse-image-stepper-increment")).toContain(atmoTheme.images.NSEStepperIncrementTemplate!.files["2x"]!);
    expect(innerBoundary.style.getPropertyValue("--nse-image-pop-up-chevron-override")).toBe("initial");
    expect(innerBoundary.style.getPropertyValue("--nse-image-search-field-magnifier")).toContain(atmoTheme.images.NSTouchBarSearchTemplate!.files["1x"]);
  });
  it("turns off only the existing login ornament effect for plain presentation", () => {
    render(<NSEAppearanceProvider theme={inner}><LoginWindow title="Sign in" methods={[{ id: "account", label: "Continue" }]} /></NSEAppearanceProvider>);
    const root = screen.getByRole("dialog"); expect(root.getAttribute("data-nse-login-presentation")).toBe("plain");
    expect(root.querySelector('[data-nse-part="attachment"]')).toBeNull(); expect(root.querySelector('[data-nse-part="suspension"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeNull(); expect(root.querySelector('[data-nse-part="bezel"]')).not.toBeNull();
  });
});
