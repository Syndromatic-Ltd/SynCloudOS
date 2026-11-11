import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nseThemeColourNames, nseThemeColourProperties } from "../../src/NSE/Theme/contract/colours";
import definition from "../../src/Themes/Atmo.scostheme/Contents/Theme.json";
const atmoColours = definition.colours;
const expected = [
  "labelColour", "secondaryLabelColour", "tertiaryLabelColour", "quaternaryLabelColour",
  "textColour", "placeholderTextColour", "selectedTextColour", "textBackgroundColour", "selectedTextBackgroundColour", "unemphasisedSelectedTextColour", "unemphasisedSelectedTextBackgroundColour",
  "keyboardFocusIndicatorColour", "linkColour", "separatorColour", "gridColour", "headerTextColour", "findHighlightColour", "highlightColour", "shadowColour",
  "selectedContentBackgroundColour", "unemphasisedSelectedContentBackgroundColour", "alternatingContentBackground1", "alternatingContentBackground2", "selectedMenuItemTextColour",
  "controlAccentColour", "controlColour", "controlBackgroundColour", "controlTextColour", "disabledControlTextColour", "selectedControlColour", "selectedControlTextColour", "alternateSelectedControlTextColour",
  "windowBackgroundColour", "windowFrameTextColour", "underPageBackgroundColour",
  "systemRed", "systemOrange", "systemYellow", "systemGreen", "systemMint", "systemTeal", "systemCyan", "systemBlue", "systemIndigo", "systemPurple", "systemPink", "systemBrown", "systemGrey",
];
describe("AppKit semantic colours", () => {
  it("publishes exactly the approved British vocabulary and CSS properties", () => {
    expect(nseThemeColourNames).toEqual(expected);
    expect(Object.isFrozen(nseThemeColourNames)).toBe(true);
    expect(Object.isFrozen(nseThemeColourProperties)).toBe(true);
    expect(nseThemeColourNames.join(" ")).not.toMatch(/Color|Gray|emphasized/);
    expect(nseThemeColourProperties.labelColour).toBe("--nse-colour-label");
    expect(nseThemeColourProperties.systemGrey).toBe("--nse-colour-system-grey");
    expect(new Set(Object.values(nseThemeColourProperties)).size).toBe(expected.length);
  });
  for (const scheme of ["light", "dark"] as const) it(`has an Atmo value for every ${scheme} semantic colour`, () => {
    expect(Object.keys(atmoColours[scheme])).toEqual(expected);
    for (const value of Object.values(atmoColours[scheme])) expect(value).toMatch(/^(#|rgb)/);
    const css = readFileSync(new URL("../../src/NSE/Appearance/nse-appearance.css", import.meta.url), "utf8");
    const block = css.split(`:where(:scope):is(:where([data-nse-colour-scheme-resolved="${scheme}"])) {`)[2];
    expect(block).toBeDefined();
    for (const property of Object.values(nseThemeColourProperties)) expect(block!.split("}")[0]).toContain(`${property}:`);
  });
});
