// @vitest-environment jsdom
import React from "react";
import { NSEPopUpButton } from "../../src/NSE/Menus/NSEPopUpButton";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { nseThemeParts } from "../../src/NSE/Theme/contract/vocabulary";

afterEach(cleanup);
const parts = new Set<string>(nseThemeParts);
const presentation = createStaticPresentationPort({ width: 1000, height: 800, reducedMotion: true });
function SurfaceHost({ children }: { children: React.ReactNode }) { return <NSEAppearanceProvider theme={atmoTheme} colourScheme="light"><StandaloneControlHost document={document} window={window} presentation={presentation}>{children}</StandaloneControlHost></NSEAppearanceProvider>; }
describe("menu and toolbar theme hooks", () => {
  it("publishes the native pop-up fallback and preserves capture handlers", () => {
    let captures = 0;
    const view = render(<NSEPopUpButton label="Order" items={[{ title: "Name", value: "name" }]} onPointerOverCapture={() => captures++} />);
    const root = view.container.querySelector<HTMLElement>('[data-nse-control="pop-up-button"]')!;
    expect(root.querySelector("select")?.dataset.nsePart).toBe("bezel");
    fireEvent.pointerOver(root);
    expect(root.hasAttribute("data-nse-hovered")).toBe(true);
    expect(captures).toBe(1);
  });
  for (const surface of themeBaselineCatalogue.filter(surface => /^(pop-up-button|path-control|toolbar|tab-view|tab-bar|menu)(-|$)/.test(surface.id))) {
    it(surface.id, async () => {
      const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
      const identity = surface.id.startsWith("tab-") ? "tab-view" : surface.id.startsWith("toolbar") ? "toolbar" : surface.id.startsWith("path-control") ? "path-control" : surface.id.startsWith("menu-bar") ? "menu-bar" : surface.id === "menu" ? "menu" : "pop-up-button";
      if (surface.id === "menu") fireEvent.click(view.getByRole("button", { name: "File" }));
      const root = identity === "menu" ? await view.findByRole("menu") : view.container.querySelector<HTMLElement>(`[data-nse-control="${identity}"]`);
      expect(root, surface.id).not.toBeNull();
      expect(root!.getAttribute("data-nse-control")).toBe(identity);
      if (surface.id.startsWith("tab-bar")) expect(root!.dataset.nseStyle).toBe("navigation");
      expect(parts.has(root!.dataset.nsePart!)).toBe(true);
      for (const part of root!.querySelectorAll<HTMLElement>("[data-nse-part]")) expect(parts.has(part.dataset.nsePart!), part.dataset.nsePart).toBe(true);
      if (surface.id.endsWith("disabled")) expect(root!.dataset.nseEnabled).toBe("false");
      for (const item of root!.querySelectorAll<HTMLElement>('[aria-selected="true"]')) expect(item.hasAttribute("data-nse-selected")).toBe(true);
      for (const item of root!.querySelectorAll<HTMLElement>('[role^="menuitem"]')) {
        expect(item.dataset.nseControl).toBe("menu-item");
        expect(item.dataset.nseEnabled).toBe(item.getAttribute("aria-disabled") === "true" ? "false" : undefined);
      }
    });
  }
});
