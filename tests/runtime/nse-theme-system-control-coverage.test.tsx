// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Themes/Atmo";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { nseThemeParts } from "../../src/NSE/Theme/contract/vocabulary";

afterEach(cleanup);
const parts = new Set<string>(nseThemeParts);
const presentation = createStaticPresentationPort({ width: 1000, height: 800, reducedMotion: true });
function SurfaceHost({ children }: { children: React.ReactNode }) { return <NSEAppearanceProvider theme={atmoTheme} colourScheme="light"><NSEStandaloneControlHost document={document} window={window} presentation={presentation}>{children}</NSEStandaloneControlHost></NSEAppearanceProvider>; }
describe("public system controls", () => {
  for (const id of ["badge", "loading-spinner"]) it(id, () => {
    const surface = themeBaselineCatalogue.find(surface => surface.id === id)!;
    const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
    const identity = id === "badge" ? "badge" : "progress-indicator";
    const root = view.container.querySelector<HTMLElement>(`[data-nse-control="${identity}"]`);
    expect(root).not.toBeNull();
    expect(parts.has(root!.dataset.nsePart!)).toBe(true);
    if (id === "loading-spinner") {
      expect(root!.dataset.nseStyle).toBe("spinning");
      expect(root!.querySelector('[data-nse-part="image"]')).not.toBeNull();
    }
  });
});
