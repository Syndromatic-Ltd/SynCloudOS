// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, onTestFailed, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { supplementalThemeCatalogue } from "../e2e/fixtures/theme-additional/supplemental";
import { additionalThemeCatalogue } from "../e2e/fixtures/theme-additional/catalogue";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
import { createStaticPresentationPort, createStaticPresentationTraits } from "../fixtures/presentationTraits";
import { nseThemeControls, nseThemeParts, nseThemeStates, nseThemeVariants } from "../../src/NSE/Theme/contract/vocabulary";
import { nseThemeColourNames } from "../../src/NSE/Theme/contract/colours";
import { createNSEThemeContract } from "../../scripts/synware/build-theme-contract.mjs";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSETitlebarAccessoryViewController } from "../../src/NSE/Application/NSETitlebarAccessoryViewController";
import { NSEToolbar } from "../../src/NSE/Toolbars/NSEToolbar";
import { WindowTitlebarView } from "../../src/NSE/Windows/WindowTitlebarView";
import { WindowView } from "../../src/NSE/Windows/WindowView";
import { TitlebarGlyphButton } from "../../src/NSE/Windows/TitlebarGlyphButton";
import { nseTopBarGlyphs } from "../../src/NSE/Windows/Chrome/topBarAssets";
import { ApplicationNavigationBackButton } from "../../src/Webspring/ApplicationNavigationBackButton";
import { AppViewChrome } from "../../src/Webspring/AppViewChrome";
import { WindowContentBorder } from "../../src/SynCloudOS/AppHosting/windowAccessories";
import { WindowPresentationContent } from "../../src/Webspring/WindowPresentationContent";
import { WindowLayer, createApplicationWindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createBrowserWindowHost } from "../../src/SynCloudOS/PlatformAdapters/BrowserWindowHost";
import { NSEWindowFrameView } from "../../src/NSE/Application/NSEWindowFrameView";
import { NSESplitViewController, NSESplitViewItem } from "../../src/NSE/DataViews/Split";
import { ViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import type { WindowPresentation, WindowRecord } from "../../src/SynCloudOS/SynCloudOS";
import { TestContentViewController, updateTraits } from "../fixtures/tabViewController";
import { modalWindow, standardWindow } from "../fixtures/windowTestDependencies";
import { createWindowLayerFixture } from "../fixtures/windowLayerFixture";
import { createClassApplicationHost } from "./fixtures/classApplicationHost";
import { nseFlashMenuSelection } from "../../src/NSE/Menus/menuSelectionFlash";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { NSEColourPanelController } from "../../src/NSE/Colour/ColourPanel/NSEColourPanelController";
import { NSEColourPanel } from "../../src/NSE/Colour/ColourPanel/NSEColourPanel";
import { GFXColour } from "../../src/FX/GraphicsFX/GFXColour";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";

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
function Host({ children }: { children: React.ReactNode }) { return <NSEAppearanceProvider theme={atmoTheme} colourScheme="light"><StandaloneControlHost document={document} window={window} presentation={presentation}>{children}</StandaloneControlHost></NSEAppearanceProvider>; }
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
it("renders the toolbar row and rail of a Metal titlebar", () => {
  const view = render(
    <Host>
      <WindowTitlebarView
        document={{ title: "Documents", subtitle: "", documentEdited: false, toolbarStyle: "unified", toolbarDisplayMode: "iconAndLabel" }}
        isKeyWindow
        material="metal"
        toolbar={<button>Open</button>}
        sidebar={{ width: 180, content: <span>Folders</span> }}
        leading={<ApplicationNavigationBackButton label="Back" onActivate={() => undefined} />}
        trailing={<TitlebarGlyphButton label="Menu" glyph={nseTopBarGlyphs.settings} selected opensMenu />}
      />
    </Host>,
  );
  const header = view.container.querySelector('[data-nse-control="window"][data-nse-part="header"]');
  expect(header?.querySelector('[data-nse-part="toolbar-row"]')?.textContent).toBe("Open");
  expect(header?.querySelector('[data-nse-part="sidebar"]')?.textContent).toBe("Folders");
  expect(header?.querySelector('[data-nse-control="button"][data-nse-role="back"]')).not.toBeNull();
  expect(header?.querySelector('[data-nse-part="cell"][data-nse-style="titlebar"][data-nse-selected]')).not.toBeNull();
  collect();
});
it("renders the large content border on embedded application chrome", () => {
  const view = render(
    <Host>
      <AppViewChrome.Root zIndex={1}>
        <WindowContentBorder thickness={44} />
      </AppViewChrome.Root>
    </Host>,
  );
  expect(view.container.querySelector('[data-nse-control="app-view-chrome"] [data-nse-part="content-border"][data-nse-content-border="large"]')).not.toBeNull();
  collect();
});
it("renders the floating Cumulus titlebar and its custom frame", () => {
  class Frame extends NSEWindowFrameView {
    static override titlebarHeight = 44;
  }
  const record = {
    ...standardWindow("theme-contract-floating", { title: "Documents" }),
    id: "theme-contract-floating",
    runtimeId: "runtime:theme-contract" as WindowRecord["runtimeId"],
    state: "open",
    isKey: true,
    isMain: true,
    zIndex: 1,
  } satisfies WindowRecord;
  const windowPresentation: WindowPresentation = {
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: true,
    titleBarVisible: true,
  };
  const view = render(
    <Host>
      <WindowView
        record={record}
        presentation={windowPresentation}
        blocked={false}
        dirty={false}
        dispatchCommand={async () => undefined}
        titleBar={<WindowTitlebarView
          document={{ title: record.title, subtitle: "", documentEdited: false, titlebarPresentation: "floating", titlebarAppearsTransparent: true, frameViewClass: Frame }}
          isKeyWindow
          material="cumulus"
          titleId={record.id + "-title"}
        />}
      >
        <p>Documents</p>
      </WindowView>
    </Host>,
  );
  const titlebar = view.container.querySelector('[data-nse-part="surface"][data-nse-role="titlebar"]');
  expect(titlebar?.getAttribute("data-nse-presentation")).toBe("floating");
  expect(titlebar?.getAttribute("data-nse-transparent")).toBe("true");
  expect(titlebar?.getAttribute("data-nse-type")).toBe("custom");
  expect(titlebar?.querySelector('[data-nse-part="floating-titlebar"]')).not.toBeNull();
  collect();
});
it("renders both dividers of a three-pane split view", () => {
  const controller = new NSESplitViewController({
    id: "theme-contract-split",
    splitViewItems: ["Sources", "Documents", "Inspector"].map(title => new NSESplitViewItem({
      identifier: title.toLowerCase(),
      viewController: new TestContentViewController(title, () => <p>{title}</p>),
    })),
  });
  try {
    const view = render(<Host><ViewControllerView controller={controller} /></Host>);
    updateTraits(controller, createStaticPresentationTraits({ width: 1000, height: 800, reducedMotion: true }));
    expect(view.container.querySelectorAll('[data-nse-part="split-divider"]')).toHaveLength(2);
    collect();
  } finally {
    cleanup();
    controller.dispose();
  }
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
  class FullSizeSheet extends Sheet {
    override sheetHasFullSizeContentView = true;
  }
  let content!: Content;
  let mainWindow!: MainWindow;
  class Content extends NSEViewController {
    constructor() { super(); content = this; }
    static override view = function ContentView() { return <p>Body</p>; };
  }
  class MainWindow extends NSEWindowController {
    readonly accessory: Accessory;
    constructor() {
      super();
      mainWindow = this;
      this.contentViewController = new Content();
      this.accessory = new Accessory();
    }
    override windowDidLoad() {
      this.window.toolbar = new NSEToolbar({ identifier: "main", items: [{ id: "share", kind: "button", label: "Share" }], defaultItemIdentifiers: ["share"] });
      this.window.addTitlebarAccessoryViewController(this.accessory);
      this.window.setContentBorderThickness(24, "minY");
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
    let sheet!: Sheet;
    await act(async () => { sheet = content.presentAsSheet(Sheet); });
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
    await act(async () => {
      content.dismiss(sheet);
      content.presentAsSheet(FullSizeSheet);
      mainWindow.window.setContentBorderThickness(44, "minY");
    });
    await waitFor(() => {
      expect(container.querySelector('[data-nse-control="system-alert"][data-nse-type="content-view"]')).not.toBeNull();
      expect(container.querySelector('[data-nse-part="content-border"][data-nse-content-border="large"]')).not.toBeNull();
    });
    collect();
    windowView.before(container);
    windowView.remove();
  } finally {
    cleanup();
    await host.dispose();
  }
});
it("renders the window transfer control with a browser window host", async () => {
  const browserHost = createBrowserWindowHost(window, () => null);
  const host = createClassApplicationHost(() => <p>Document</p>, "com.example.theme-contract-transfer", browserHost);
  const renderers = createApplicationWindowContentRendererRegistry(host.runtime, { [host.appId]: host.runtime.apps.getApp(host.appId)! });
  try {
    await host.launch();
    await host.openMainWindow();
    const view = render(
      <Host>
        <SynCloudOSProvider runtime={host.runtime}>
          <HostSiteBrandingProvider value={{ name: "Theme contract", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null }}>
            <WindowPresentationContent>
              <WindowLayer contentRegistry={renderers} />
            </WindowPresentationContent>
          </HostSiteBrandingProvider>
        </SynCloudOSProvider>
      </Host>,
    );
    await view.findByText("Document");
    expect(view.container.querySelector('[data-nse-part="button"][data-nse-role="transfer"]')).not.toBeNull();
    collect();
  } finally {
    cleanup();
    renderers.dispose();
    await host.dispose();
  }
});
it("renders a backdrop for a system-wide modal window", async () => {
  const fixture = await createWindowLayerFixture();
  try {
    const modal = fixture.manager.create(modalWindow("theme-contract-modal", null, { applicationId: null, applicationSessionId: null }));
    await fixture.manager.open(modal.id);
    const view = render(
      <Host>
        <SynCloudOSProvider runtime={fixture.runtime}>
          <WindowLayer contentRegistry={fixture.contentRegistry} />
        </SynCloudOSProvider>
      </Host>,
    );
    expect(view.container.querySelector('[data-nse-control="window"][data-nse-part="backdrop"][data-nse-role="modal"]')).not.toBeNull();
    collect();
  } finally {
    cleanup();
    await fixture.cleanup();
  }
});
it("renders colour panel states", async () => {
  const runtime = createSynCloudOS({ id: "contract-colour-panel", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" });
  const controller = new NSEColourPanelController(runtime, { owner: nseUnowned });
  const noop = () => undefined;
  const release = controller.activateTarget({ id: "contract-colour-anchor", responderId: "contract", read: () => GFXColour.parse("#336699"), preview: noop, commit: noop, cancel: noop, showsAlpha: true });
  controller.open();
  try {
    const view = render(<Host><button id="contract-colour-anchor">Accent</button><NSEColourPanel controller={controller} eyeDropper={{ availability: () => "available" as const, pick: async () => ({ kind: "unavailable" as const }) }} /></Host>);
    await waitFor(() => expect(document.querySelector('[data-nse-part="opacity-row"]')).not.toBeNull());
    collect();
    // An unavailable eyedropper: the panel reports it.
    fireEvent.click(document.querySelector<HTMLElement>('[data-nse-part="eyedropper"]')!);
    await waitFor(() => expect(document.querySelector('[data-nse-part="eyedropper-status"]')).not.toBeNull());
    collect();
    fireEvent.click(await view.findByRole("tab", { name: "Colour Sliders" }));
    fireEvent.click(await view.findByRole("button", { name: /Slider model/u }));
    fireEvent.click(await view.findByRole("option", { name: "Grey Scale Slider" }));
    await waitFor(() => expect(document.querySelector('[data-nse-part="grey-presets"]')).not.toBeNull());
    collect();
    fireEvent.click(await view.findByRole("tab", { name: "Colour Palettes" }));
    const search = await view.findByRole("searchbox");
    fireEvent.change(search, { target: { value: "no colour is called this" } });
    await waitFor(() => expect(document.querySelector('[data-nse-part="colour-list-empty"]')).not.toBeNull());
    collect();
    fireEvent.click(await view.findByRole("tab", { name: "Image Palettes" }));
    const canvas = await waitFor(() => { const element = document.querySelector<HTMLCanvasElement>('[data-nse-control="colour-panel"] canvas'); expect(element).not.toBeNull(); return element!; });
    fireEvent.pointerDown(canvas, { clientX: 4, clientY: 4, pointerId: 1 });
    await waitFor(() => expect(document.querySelector('[data-nse-part="image-marker"]')).not.toBeNull());
    collect();
    cleanup();
    render(<Host><NSEColourPanel controller={controller} contentState="empty" /></Host>);
    await waitFor(() => expect(document.querySelector('[data-nse-part="content-message"]')).not.toBeNull());
    collect();
  } finally {
    cleanup();
    release();
    controller.dispose();
    await runtime.dispose("contract test finished");
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
