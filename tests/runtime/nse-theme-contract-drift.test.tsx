// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, onTestFailed, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { supplementalThemeCatalogue } from "../e2e/fixtures/theme-additional/supplemental";
import { additionalThemeCatalogue } from "../e2e/fixtures/theme-additional/catalogue";
import { NSEStandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Themes/Atmo";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { nseThemeControls, nseThemeParts, nseThemeStates, nseThemeVariants } from "../../src/NSE/Theme/contract/vocabulary";
import { nseThemeColourNames } from "../../src/NSE/Theme/contract/colours";
import { createNSEThemeContract } from "../../scripts/synware/build-theme-contract.mjs";

const repository = resolve(import.meta.dirname, "../..");
const presentation = createStaticPresentationPort({ width: 1000, height: 800, reducedMotion: true });
const controls = new Map<string, { parts: Set<string>; states: Set<string>; variants: Map<string, Set<string>> }>();
let renderingFailed = false;
beforeEach(() => { onTestFailed(() => { renderingFailed = true; }); });
function collect() {
  for (const root of document.querySelectorAll<HTMLElement>("[data-nse-control]")) {
    const name = root.getAttribute("data-nse-control")!;
    expect(nseThemeControls as readonly string[], `unknown control ${name}`).toContain(name);
    let entry = controls.get(name);
    if (!entry) controls.set(name, entry = { parts: new Set(), states: new Set(), variants: new Map() });
    for (const part of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
      if (part.closest("[data-nse-control]") !== root) continue;
      const partName = part.getAttribute("data-nse-part");
      if (partName) { expect(nseThemeParts as readonly string[], `unknown part ${name}.${partName}`).toContain(partName); entry.parts.add(partName); }
      for (const state of nseThemeStates) if (part.hasAttribute(`data-nse-${state}`)) entry.states.add(state === "state" || state === "enabled" || state === "key-window" || state === "tracking" ? `${state}=${part.getAttribute(`data-nse-${state}`)}` : state);
      for (const variant of nseThemeVariants) {
        const value = part.getAttribute(`data-nse-${variant}`);
        if (value === null) continue;
        let values = entry.variants.get(variant); if (!values) entry.variants.set(variant, values = new Set()); values.add(value);
      }
    }
  }
}
function Host({ children }: { children: React.ReactNode }) { return <NSEAppearanceProvider theme={atmoTheme} colourScheme="light"><NSEStandaloneControlHost document={document} window={window} presentation={presentation}>{children}</NSEStandaloneControlHost></NSEAppearanceProvider>; }
afterEach(cleanup);
for (const surface of themeBaselineCatalogue) it(`renders ${surface.id}`, async () => {
  const view = render(<Host>{surface.render()}</Host>);
  if (surface.id === "web-view") {
    // jsdom does not load blob-backed iframes. Deliver its native load event.
    await waitFor(() => expect(document.querySelector('iframe[data-nse-control="web-view"]')).not.toBeNull());
    fireEvent.load(document.querySelector("iframe")!);
  }
  if (surface.ready) await waitFor(() => expect(document.querySelector(surface.ready!)).not.toBeNull());
  collect();
  if (surface.chooseTab) fireEvent.click(await view.findByRole("tab", { name: surface.chooseTab }));
  if (surface.interaction === "open" || surface.id === "menu") fireEvent.click(view.queryAllByRole("button")[0] ?? view.getAllByRole("menuitem")[0]!);
  if (surface.interaction === "folder") {
    const folder = document.querySelector<HTMLElement>('[data-nse-control="folder-tile"]');
    if (folder) fireEvent.click(folder);
  }
  const root = view.container.querySelector<HTMLElement>("[data-nse-control]");
  if (root && surface.interaction === "hover") fireEvent.pointerOver(root);
  if (root && surface.interaction === "press") fireEvent.keyDown(root, { key: "Enter" });
  if (surface.interaction === "focus") {
    const target = view.container.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]');
    if (target) { fireEvent.keyDown(document.body, { key: "Tab" }); act(() => target.focus()); }
  }
  collect();
});
for (const surface of additionalThemeCatalogue) it(`renders additional ${surface.id}`, () => {
  const view = render(<Host>{surface.render("light")}</Host>);
  if (surface.action === "select-next") fireEvent.keyDown(document, { key: "ArrowRight" });
  if (surface.action === "disclose") { const button = view.getAllByRole("button").find(element => /detail/i.test(element.textContent ?? "")); if (button) fireEvent.click(button); }
  collect();
});
for (const surface of supplementalThemeCatalogue) it(`renders supplemental ${surface.id}`, async () => {
  render(<Host>{surface.render()}</Host>);
  await act(async () => { await Promise.resolve(); });
  collect();
});
afterAll(() => {
  const contract = createNSEThemeContract(controls, { controls: nseThemeControls, parts: nseThemeParts, states: nseThemeStates, variants: nseThemeVariants }, nseThemeColourNames);
  const path = resolve(repository, "tooling/nse-theme-contract.json");
  if (process.env.THEME_CONTRACT_WRITE === "1" && !renderingFailed) { mkdirSync(resolve(repository, "tooling"), { recursive: true }); writeFileSync(path, JSON.stringify(contract, null, 2) + "\n"); }
  expect(existsSync(path), "Generate the rendered contract with node scripts/synware/build-theme-contract.mjs").toBe(true);
  expect(contract, "Rendered hooks differ from the published contract; review the API change before regenerating.").toEqual(JSON.parse(readFileSync(path, "utf8")));
});
