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
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSETitlebarAccessoryViewController } from "../../src/NSE/Application/NSETitlebarAccessoryViewController";
import { NSEToolbar } from "../../src/NSE/Toolbars/NSEToolbar";
import { createClassApplicationHost } from "./fixtures/classApplicationHost";
import { nseFlashMenuSelection } from "../../src/NSE/Menus/menuSelectionFlash";

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
  // A bare surface has no overlay host, so controls draw their native fallbacks.
  render(surface.bare ? <NSEAppearanceProvider theme={atmoTheme} colourScheme="light">{surface.render()}</NSEAppearanceProvider> : <Host>{surface.render()}</Host>);
  await act(async () => { await Promise.resolve(); });
  if (surface.ready) await waitFor(() => expect(document.querySelector(surface.ready!)).not.toBeNull());
  collect();
  if (surface.activate) {
    fireEvent.click(document.querySelector<HTMLElement>(surface.activate)!);
    if (surface.activeReady) await waitFor(() => expect(document.querySelector(surface.activeReady!)).not.toBeNull());
    await act(async () => { await Promise.resolve(); });
    collect();
  }
  if (surface.hover) {
    fireEvent.pointerOver(document.querySelector<HTMLElement>(surface.hover)!);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
    collect();
  }
  if (surface.context) {
    fireEvent.contextMenu(document.querySelector<HTMLElement>(surface.context)!);
    await act(async () => { await Promise.resolve(); });
    collect();
  }
  if (surface.id === "segment-menu" || surface.id === "segment-overflow") {
    fireEvent.click(document.querySelector<HTMLElement>('[data-nse-expanded="false"]')!);
    await act(async () => { await Promise.resolve(); });
    collect();
  }
  await flashOpenMenus();
});
// A hosted application window draws its toolbar and titlebar accessories in the window chrome.
it("renders a hosted application window", async () => {
  class Accessory extends NSETitlebarAccessoryViewController {
    static override view = function AccessoryView() { return <span>Filter</span>; };
  }
  class Sheet extends NSEViewController {
    override title = "Rename";
    static override view = function SheetView() { return <p>Sheet</p>; };
  }
  let content!: Content;
  class Content extends NSEViewController {
    constructor() { super(); content = this; }
    static override view = function ContentView() { return <p>Body</p>; };
  }
  class MainWindow extends NSEWindowController {
    readonly accessory: Accessory;
    constructor() { super(); this.contentViewController = new Content(); this.accessory = new Accessory(); }
    override windowDidLoad() {
      this.window.toolbar = new NSEToolbar({ identifier: "main", items: [{ id: "share", kind: "button", label: "Share" }], defaultItemIdentifiers: ["share"] });
      this.window.addTitlebarAccessoryViewController(this.accessory);
    }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.theme-contract");
  try {
    await host.launch();
    host.mountWindows();
    await act(async () => { await host.openMainWindow(); });
    await waitFor(() => expect(document.querySelector('[data-nse-part="titlebar-accessories"]')).not.toBeNull());
    // A sheet attaches under the toolbar, in the window's sheet frame.
    await act(async () => { content.presentAsSheet(Sheet); });
    await waitFor(() => expect(document.querySelector('[data-nse-part="sheet"]')).not.toBeNull());
    // Production draws a hosted window's content inside its NSEWindowView; the class host renders the content alone.
    // Move the host's container into a window section so its chrome parts are recorded under the window, as they draw.
    const container = document.querySelector('[data-nse-part="toolbar"]')!.closest("body > div")!;
    const windowView = document.createElement("section");
    windowView.setAttribute("data-nse-control", "window");
    windowView.setAttribute("data-nse-part", "content");
    container.before(windowView);
    windowView.append(container);
    collect();
    windowView.before(container);
    windowView.remove();
  } finally {
    cleanup();
    await host.dispose();
  }
});
// A chosen menu row flashes before its menu acts and fades: drive the real flash on each open menu's first row.
async function flashOpenMenus() {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-nse-control="menu-item"][data-nse-part="cell"]:not([data-nse-enabled="false"])')];
  if (!rows.length) return;
  const matchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  try {
    const flashes = [nseFlashMenuSelection(rows[0])];
    collect();
    await act(async () => { await Promise.all(flashes); });
    collect();
  } finally {
    window.matchMedia = matchMedia;
  }
}
afterAll(() => {
  const contract = createNSEThemeContract(controls, { controls: nseThemeControls, parts: nseThemeParts, states: nseThemeStates, variants: nseThemeVariants }, nseThemeColourNames);
  const path = resolve(repository, "tooling/nse-theme-contract.json");
  if (process.env.THEME_CONTRACT_WRITE === "1" && !renderingFailed) { mkdirSync(resolve(repository, "tooling"), { recursive: true }); writeFileSync(path, JSON.stringify(contract, null, 2) + "\n"); }
  expect(existsSync(path), "Generate the rendered contract with node scripts/synware/build-theme-contract.mjs").toBe(true);
  expect(contract, "Rendered hooks differ from the published contract; review the API change before regenerating.").toEqual(JSON.parse(readFileSync(path, "utf8")));
});
