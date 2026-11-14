// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
import { NSEScrollView } from "../../src/NSE/Scroll/NSEScrollView";
import { NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { nseThemeParts } from "../../src/NSE/Theme/contract/vocabulary";

afterEach(cleanup);
const parts = new Set<string>(nseThemeParts);
const presentation = createStaticPresentationPort({ width: 1000, height: 800, reducedMotion: true });
function SurfaceHost({ children }: { children: React.ReactNode }) { return <NSEAppearanceProvider theme={atmoTheme} colourScheme="light"><StandaloneControlHost document={document} window={window} presentation={presentation}>{children}</StandaloneControlHost></NSEAppearanceProvider>; }
describe("public theme hook coverage", () => {
  it("uses British semantic colour and background-style names on label fields", () => {
    const view = render(<NSETextField isEditable={false} textColour="secondaryLabelColour" backgroundStyle="emphasised">Readout</NSETextField>);
    const root = view.container.querySelector('[data-nse-control="text-field"]');
    expect(root?.getAttribute("data-nse-text-colour")).toBe("secondaryLabelColour");
    expect(root?.getAttribute("data-nse-background-style")).toBe("emphasised");
    expect(root?.getAttribute("data-nse-editable")).toBe("false");
  });
  for (const surface of themeBaselineCatalogue.filter(surface => /^(button|switch|slider|segmented-control|stepper|level-indicator|progress-indicator|text-field|search-field|secure-text-field|combo-box|token-field|text-view|text-input-host|ruler-view)(-|$)/.test(surface.id))) {
    it(surface.id, () => {
      const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
      const control = surface.id === "text-input-host" ? "text-view" : ["secure-text-field", "text-field", "search-field", "combo-box", "token-field", "text-view", "ruler-view", "progress-indicator", "level-indicator", "segmented-control", "stepper", "switch", "slider"].find(control => surface.id === control || surface.id.startsWith(`${control}-`)) ?? "button";
      const root = view.container.querySelector<HTMLElement>(`[data-nse-control="${control}"]`);
      expect(root, `${surface.id} publishes its identity`).not.toBeNull();
      expect(parts.has(root!.dataset.nsePart!)).toBe(true);
      if (control === "button" || control === "switch") expect(root!.querySelector(':scope > [data-nse-part="bezel"]')).not.toBeNull();
      for (const element of root!.querySelectorAll("*")) expect(parts.has(element.closest<HTMLElement>("[data-nse-part]")?.dataset.nsePart ?? "")).toBe(true);
      if (root!.dataset.bezelStyle) expect(root!.dataset.nseBezelStyle).toBe(root!.dataset.bezelStyle);
      expect(root!.dataset.nseEnabled).toBe(surface.id.endsWith("disabled") ? "false" : undefined);
      if (surface.id.endsWith("highlighted")) expect(root!.hasAttribute("data-nse-highlighted")).toBe(true);
      if (control === "text-view") expect(root!.dataset.nseEditable).toBe(surface.id.includes("read-only") ? "false" : "true");
      if (control === "switch") expect(root!.dataset.nseState).toBe(root!.dataset.state);
      if (surface.id.endsWith("mixed")) expect(root!.dataset.nseState).toBe("mixed");
      if (surface.interaction === "hover") { fireEvent.pointerOver(root!); expect(root!.hasAttribute("data-nse-hovered")).toBe(true); fireEvent.pointerOut(root!); expect(root!.hasAttribute("data-nse-hovered")).toBe(false); }
      if (surface.interaction === "focus") {
        const target = root!.matches("button,input") ? root! : root!.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[role="slider"][tabindex="0"]')!;
        fireEvent.keyDown(document.body, { key: "Tab" });
        act(() => target.focus()); expect(root!.hasAttribute("data-nse-focused")).toBe(true);
        act(() => target.blur()); expect(root!.hasAttribute("data-nse-focused")).toBe(false);
      }
      if (surface.interaction === "press") { fireEvent.keyDown(root!, { key: "Enter" }); expect(root!.hasAttribute("data-nse-highlighted")).toBe(true); fireEvent.keyUp(root!, { key: "Enter" }); }
    });
  }
});

const containerIdentities: Readonly<Record<string, string>> = {
  "source-list": "outline-view", "container-pane": "box", "stack-item": "stack-view", "input-box": "text-field",
};
const containerNames = ["box", "stack-view", "grid-view", "split-view", "drawer", "scroll-view", "clip-view", "view", "image-view", "table-view", "table-cell-view", "outline-view", "collection-view", "browser", "rule-editor", "predicate-editor", "virtual-viewport", "page-controller"];
describe("container theme hooks", () => {
  it("preserves a composing control's clip part", () => {
    const view = render(<NSEScrollView data-nse-part="colour-list-scroll">Content</NSEScrollView>);
    expect(view.container.querySelector('[data-nse-control="clip-view"]')?.getAttribute("data-nse-part")).toBe("colour-list-scroll");
  });
  for (const surface of themeBaselineCatalogue) {
    const name = [...Object.keys(containerIdentities), ...containerNames].find(name => surface.id === name || surface.id.startsWith(`${name}-`));
    if (!name) continue;
    const identity = containerIdentities[name] ?? name;
    it(surface.id, () => {
      const view = render(<SurfaceHost>{surface.render()}</SurfaceHost>);
      const root = view.container.querySelector<HTMLElement>(`[data-nse-control="${identity}"]`);
      expect(root, `${surface.id} publishes ${identity}`).not.toBeNull();
      expect(parts.has(root!.dataset.nsePart!)).toBe(true);
      for (const part of root!.querySelectorAll<HTMLElement>("[data-nse-part]")) expect(parts.has(part.dataset.nsePart!), part.dataset.nsePart).toBe(true);
      for (const item of root!.querySelectorAll<HTMLElement>('[aria-selected="true"]')) expect(item.hasAttribute("data-nse-selected")).toBe(true);
      if (surface.id.endsWith("disabled")) expect(root!.dataset.nseEnabled).toBe("false");
      if (surface.id.endsWith("selected")) expect(root!.querySelector("[data-nse-selected]")).not.toBeNull();
    });
  }
});
