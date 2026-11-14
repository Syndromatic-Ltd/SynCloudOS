// @vitest-environment jsdom
import React from "react";
import { AppViewChrome } from "../../src/Webspring/AppViewChrome";
import { AppFrame } from "../../src/NSE/Windows/AppFrame";
import { cleanup, render, waitFor } from "@testing-library/react";
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
const systemIdentities: Readonly<Record<string, string>> = { "about": "panel", "confirm-dialog": "system-alert", "settings": "panel", "board": "board", "notifications": "notification-banner", "notification-centre": "notification-centre", "folder-presentation": "board" };
describe("system surface theme hooks", () => {
  it("publishes the stage's key state and its status-bar slot", () => {
    const surface = (keyWindow: boolean) => <SurfaceHost><AppViewChrome.Root zIndex={1} keyWindow={keyWindow}><AppFrame statusBar={<span>Ready</span>}>Content</AppFrame></AppViewChrome.Root></SurfaceHost>;
    const view = render(surface(false));
    const root = view.container.querySelector<HTMLElement>('[data-nse-control="app-view-chrome"]')!;
    expect(root.dataset.nseKeyWindow).toBe("false");
    expect(root.querySelector('[data-nse-control="status-bar"]')).not.toBeNull();
    view.rerender(surface(true));
    expect(root.hasAttribute("data-nse-key-window")).toBe(false);
  });
  for (const surface of themeBaselineCatalogue.filter(surface => surface.id.startsWith("login-window-") || surface.id in systemIdentities)) {
    it(surface.id, async () => {
      const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
      const identity = surface.id.startsWith("login-window-") ? "login-window" : systemIdentities[surface.id]!;
      const root = await waitFor(() => {
        const element = view.baseElement.querySelector<HTMLElement>(`[data-nse-control="${identity}"]`);
        expect(element, surface.id).not.toBeNull();
        return element!;
      });
      expect(parts.has(root.dataset.nsePart!)).toBe(true);
      for (const part of root.querySelectorAll<HTMLElement>("[data-nse-part]")) expect(parts.has(part.dataset.nsePart!), part.dataset.nsePart).toBe(true);
      if (identity === "board") {
        expect(root.querySelector('[data-nse-control="app-icon"]')).not.toBeNull();
        expect(root.querySelector('[data-nse-control="folder-tile"]')).not.toBeNull();
      }
    });
  }
});
