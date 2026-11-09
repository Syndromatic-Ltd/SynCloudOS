// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { nseThemeParts } from "../../src/NSE/Theme/contract/vocabulary";

afterEach(cleanup);
const parts = new Set<string>(nseThemeParts);
describe("public theme hook coverage", () => {
  for (const surface of themeBaselineCatalogue.filter(surface => /^(button|switch)-/.test(surface.id))) {
    it(surface.id, () => {
      const view = render(<>{surface.render()}</>);
      const control = surface.id.startsWith("switch-") ? "switch" : "button";
      const root = view.container.querySelector<HTMLElement>(`[data-nse-control="${control}"]`);
      expect(root, `${surface.id} publishes its identity`).not.toBeNull();
      expect(parts.has(root!.dataset.nsePart!)).toBe(true);
      expect(root!.querySelector(':scope > [data-nse-part="bezel"]')).not.toBeNull();
      for (const element of root!.querySelectorAll("*")) expect(parts.has(element.closest<HTMLElement>("[data-nse-part]")?.dataset.nsePart ?? "")).toBe(true);
      if (root!.dataset.bezelStyle) expect(root!.dataset.nseBezelStyle).toBe(root!.dataset.bezelStyle);
      expect(root!.dataset.nseEnabled).toBe(surface.id.endsWith("disabled") ? "false" : undefined);
      if (surface.id.endsWith("highlighted")) expect(root!.hasAttribute("data-nse-highlighted")).toBe(true);
      if (control === "switch") expect(root!.dataset.nseState).toBe(root!.dataset.state);
      if (surface.id.endsWith("mixed")) expect(root!.dataset.nseState).toBe("mixed");
      if (surface.interaction === "hover") { fireEvent.pointerOver(root!); expect(root!.hasAttribute("data-nse-hovered")).toBe(true); fireEvent.pointerOut(root!); expect(root!.hasAttribute("data-nse-hovered")).toBe(false); }
      if (surface.interaction === "focus") {
        const target = root!.matches("button") ? root! : root!.querySelector<HTMLElement>("input")!;
        fireEvent.keyDown(document.body, { key: "Tab" });
        act(() => target.focus()); expect(root!.hasAttribute("data-nse-focused")).toBe(true);
        act(() => target.blur()); expect(root!.hasAttribute("data-nse-focused")).toBe(false);
      }
      if (surface.interaction === "press") { fireEvent.keyDown(root!, { key: "Enter" }); expect(root!.hasAttribute("data-nse-highlighted")).toBe(true); fireEvent.keyUp(root!, { key: "Enter" }); }
    });
  }
});
