import { describe, expect, it } from "vitest";
import { isMirrorValue, mirroredHookName, mirroredHookNames, mirrorProps, mirrorSelector, mirrorTokens } from "../../src/NSE/Theme/contract/hookMirror.mjs";
import { nseThemeStates, nseThemeVariants } from "../../src/NSE/Theme/contract/vocabulary";

describe("contract hook mirror classes", () => {
  it("mirrors exactly the contract vocabulary and the appearance attributes", () => {
    expect([...mirroredHookNames].sort()).toEqual(["control", "part", ...nseThemeStates, ...nseThemeVariants, "theme", "colour-scheme-resolved", "contrast", "transparency"].sort());
    expect(mirroredHookName("data-nse-part")).toBe("part");
    expect(mirroredHookName("data-nse-toolbar-item-id")).toBeNull();
    expect(mirroredHookName("data-state")).toBeNull();
  });

  it("gives a presence token always and a value token only when the value can be one", () => {
    expect(mirrorTokens("part", "bezel")).toEqual(["nse:part", "nse:part=bezel"]);
    expect(mirrorTokens("hovered", "")).toEqual(["nse:hovered"]);
    expect(mirrorTokens("key-equivalent", " ")).toEqual(["nse:key-equivalent"]);
    expect(mirrorTokens("key-equivalent", "\r")).toEqual(["nse:key-equivalent"]);
    expect(isMirrorValue("a b")).toBe(false);
    expect(isMirrorValue("pop-up-button")).toBe(true);
  });

  it("writes the class selector an attribute selector is equal to, or keeps the attribute", () => {
    expect(mirrorSelector("control", "button")).toBe(".nse\\:control\\=button");
    expect(mirrorSelector("hovered", null)).toBe(".nse\\:hovered");
    expect(mirrorSelector("enabled", "false")).toBe(".nse\\:enabled\\=false");
    expect(mirrorSelector("key-equivalent", " ")).toBeNull();
    expect(mirrorSelector("style", "")).toBeNull();
    expect(mirrorSelector("toolbar-item-id", "save")).toBeNull();
    // A selector the browser parses back to the same token.
    expect(mirrorSelector("height", "1.5")).toBe(".nse\\:height\\=1\\.5");
  });

  it("appends tokens to a host element's own classes and leaves hook-free props alone", () => {
    const plain = { className: "mine", id: "a" };
    expect(mirrorProps(plain)).toBe(plain);
    expect(mirrorProps({ className: "mine", "data-nse-control": "button", "data-nse-hovered": "", "data-nse-key-equivalent": " ", "data-nse-toolbar-item-id": "save" }).className)
      .toBe("mine nse:control nse:control=button nse:hovered nse:key-equivalent");
    expect(mirrorProps({ "data-nse-part": "bezel" }).className).toBe("nse:part nse:part=bezel");
  });

  it("gives no token to a hook React would not render", () => {
    const props = { "data-nse-selected": undefined, "data-nse-hovered": null, "data-nse-focused": false };
    expect(mirrorProps(props)).toBe(props);
    expect(mirrorProps({ "data-nse-expanded": true }).className).toBe("nse:expanded nse:expanded=true");
  });

  it("drops tokens a cloned element's hooks no longer justify", () => {
    expect(mirrorProps({ className: "mine nse:selected", "data-nse-part": "row" }).className).toBe("mine nse:part nse:part=row");
    expect(mirrorProps({ className: "nse:selected" }).className).toBeUndefined();
  });
});
