import { describe, expect, it } from "vitest";
import * as appearance from "../../src/NSE/public/appearance";
import * as publicNSE from "../../src/NSE/sdkPackageEntry";
import { freezeNSETheme } from "../../src/NSE/Theme/NSETheme";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
describe("NSETheme replaces appearance definitions", () => {
  it("removes the definition factory and slot API from both public entries", () => {
    for (const entry of [appearance, publicNSE]) for (const name of ["defineNSEAppearance", "useNSEAppearanceSlot", "resolveNSEAppearanceSlot"]) expect(entry).not.toHaveProperty(name);
  });
  it("takes an owned, deeply frozen copy of theme data", () => {
    const input = JSON.parse(JSON.stringify(atmoTheme)); const theme = freezeNSETheme(input);
    input.colours.light.labelColour = "red"; expect(theme.colours.light.labelColour).toBe(atmoTheme.colours.light.labelColour);
    expect(theme).not.toHaveProperty("recipes"); expect(theme).not.toHaveProperty("id");
    for (const value of [theme, theme.colours, theme.colours.light, theme.navigation.compact, theme.images]) expect(Object.isFrozen(value)).toBe(true);
  });
});
