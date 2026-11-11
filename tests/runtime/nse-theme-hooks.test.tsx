import { describe, expect, it } from "vitest";
import { nseControlHooks, nsePartHooks } from "../../src/NSE/Theme/contract/hooks";
import { nseThemeControls, nseThemeParts, nseThemeStates, nseThemeVariants } from "../../src/NSE/Theme/contract/vocabulary";

describe("theme hook vocabulary", () => {
  it("publishes exact AppKit state and variant attributes", () => {
    expect(nseControlHooks({ control: "button", highlighted: true, enabled: false, variants: { "bezel-style": "push" } })).toEqual({ "data-nse-control": "button", "data-nse-highlighted": "", "data-nse-enabled": "false", "data-nse-bezel-style": "push" });
    expect(nseControlHooks({ control: "button", state: "mixed", selected: true, hovered: true, focused: true })).toEqual({ "data-nse-control": "button", "data-nse-state": "mixed", "data-nse-selected": "", "data-nse-hovered": "", "data-nse-focused": "" });
    expect(nseControlHooks({ control: "button", enabled: true, selected: false, hovered: false })).toEqual({ "data-nse-control": "button" });
    expect(nseControlHooks({ control: "window", keyWindow: false })).toEqual({ "data-nse-control": "window", "data-nse-key-window": "false" });
    expect(nsePartHooks("bezel")).toEqual({ "data-nse-part": "bezel" });
  });
  it("rejects unknown controls, parts, states and variant attributes", () => {
    expect(() => nseControlHooks({ control: "unknown" as never })).toThrow(TypeError);
    expect(() => nsePartHooks("unknown" as never)).toThrow(TypeError);
    expect(() => nseControlHooks({ control: "button", state: "pressed" as never })).toThrow(TypeError);
    expect(() => nseControlHooks({ control: "button", variants: { "private-class": "a" } })).toThrow(TypeError);
  });
  it("is frozen, unique and contains no theme-specific vocabulary", () => {
    const forbidden = ["atmo", "metal-centre", "grouped-toolbutton", "bottom-fade", "top-fade", "heritage", "onyx"];
    for (const list of [nseThemeControls, nseThemeParts, nseThemeStates, nseThemeVariants]) {
      expect(Object.isFrozen(list)).toBe(true); expect(new Set(list).size).toBe(list.length);
      for (const entry of list) for (const term of forbidden) expect(entry).not.toContain(term);
    }
  });
});
