// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoAppearance } from "../../src/NSE/Themes/Atmo";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { nseThemeParts } from "../../src/NSE/Theme/contract/vocabulary";

afterEach(cleanup);
const parts = new Set<string>(nseThemeParts);
const presentation = createStaticPresentationPort({ width: 1000, height: 800, reducedMotion: true });
function SurfaceHost({ children }: { children: React.ReactNode }) { return <NSEAppearanceProvider appearance={atmoAppearance} colourScheme="light"><NSEStandaloneControlHost document={document} window={window} presentation={presentation}>{children}</NSEStandaloneControlHost></NSEAppearanceProvider>; }
describe("date, panel and window theme hooks", () => {
  it("publishes date pointer and keyboard-focus drawing state", () => {
    const surface = themeBaselineCatalogue.find(surface => surface.id === "date-picker-textFieldAndStepper-enabled")!;
    const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
    const root = view.container.querySelector<HTMLElement>('[data-nse-control="date-picker"]')!;
    fireEvent.pointerOver(root);
    expect(root.hasAttribute("data-nse-hovered")).toBe(true);
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => root.querySelector("input")!.focus());
    expect(root.hasAttribute("data-nse-focused")).toBe(true);
  });
  for (const surface of themeBaselineCatalogue.filter(surface => /^(date-picker|time-picker|colour-well|colour-panel|font-panel|open-panel|save-panel|route-picker|web-view|titlebar|top-bar|window|popover|sheet)(-|$)/.test(surface.id))) {
    it(surface.id, async () => {
      const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
      if (surface.chooseTab) fireEvent.click(await view.findByRole("tab", { name: surface.chooseTab }));
      const identity = surface.id.startsWith("date-picker") || surface.id.startsWith("time-picker") ? "date-picker" : surface.id.startsWith("titlebar") || surface.id.startsWith("top-bar") || surface.id.startsWith("window") ? "window" : surface.id.startsWith("route-picker") ? "route-picker-view" : ["colour-well", "colour-panel", "font-panel", "open-panel", "save-panel", "web-view", "popover", "sheet"].find(name => surface.id === name || surface.id.startsWith(`${name}-`))!;
      const root = await waitFor(() => {
        const element = view.baseElement.querySelector<HTMLElement>(`[data-nse-control="${identity}"]`);
        expect(element, `${surface.id} publishes ${identity}`).not.toBeNull();
        return element!;
      });
      expect(parts.has(root.dataset.nsePart!)).toBe(true);
      if (surface.id.startsWith("window-")) {
        expect(root.dataset.nseChrome).toBe(surface.id.split("-")[1]);
        expect(root.dataset.nseKeyWindow).toBe(surface.id.includes("-inactive-") ? "false" : undefined);
      }
      if (surface.id.startsWith("date-picker-") || surface.id.startsWith("time-picker-")) {
        expect(root.dataset.nseDatePickerStyle).toBe(surface.id.split("-")[2]);
        expect(root.dataset.nsePickerMode).toBe(surface.id.startsWith("time-") ? "time" : "date");
      }
      for (const part of root.querySelectorAll<HTMLElement>("[data-nse-part]")) expect(parts.has(part.dataset.nsePart!), part.dataset.nsePart).toBe(true);
      if (surface.id.endsWith("disabled")) expect(root.dataset.nseEnabled).toBe("false");
      for (const item of root.querySelectorAll<HTMLElement>('[aria-selected="true"]')) expect(item.hasAttribute("data-nse-selected")).toBe(true);
    });
  }
});
