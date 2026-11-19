// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, onTestFailed, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { themeBaselineCatalogue } from "../e2e/fixtures/theme-baseline/catalogue";
import { supplementalThemeCatalogue, Toolbar as ConfiguredToolbarSpecimen } from "../e2e/fixtures/theme-additional/supplemental";
import { additionalThemeCatalogue } from "../e2e/fixtures/theme-additional/catalogue";
import { ListboxPopup, NSEPopover, NSEPopup, StandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEStackItem, NSEStackView } from "../../src/NSE/Layout";
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
import { HostSiteBrandingProvider, RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";
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
import { TabBar, TabBarOverflowList } from "../../src/NSE/Navigation/TabBar";
import { TabBarController } from "../../src/NSE/Navigation/TabBarController";
import { HostLoginGate } from "../../src/Webspring/HostLoginGate";
import { LoginWindow } from "../../src/NSE/SystemUI/LoginWindow";
import { LoginCheckbox } from "../../src/NSE/SystemUI/LoginWindow/LoginCheckbox";
import { LoginField } from "../../src/NSE/SystemUI/LoginWindow/LoginField";
import { OpenPanelSheetSurface } from "../../src/NSE/Windows/windowSheetSurfaces";
import { OpenPanelCollection } from "../../src/NSE/FilePanels/NSEOpenPanelCollection";
import { OpenPanelSources } from "../../src/NSE/FilePanels/NSEOpenPanelSources";
import { MediaCollectionPresenter } from "../../src/NSE/MediaPanels/NSEMediaCollectionPresenter";
import { IFXImageView, type IFXImageResource } from "../../src/FX/ImageFX/public";
import { NSEArrayController, NSETreeController } from "../../src/NSE/Controllers";
import { NSECollectionView, createCoverFlowCollectionLayout } from "../../src/NSE/DataViews/Collection";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline";
import { NSEPredicateEditor } from "../../src/NSE/DataViews/RuleEditor";
import { attachmentRun, attributedContent, createInMemoryNSETextOwner, paragraph, textRun } from "../../src/NSE/Text";
import { NSETextView } from "../../src/NSE/TextEditing/NSETextView";
import { TextEditingSession } from "../../src/NSE/TextEditing/TextEditingSession";
import { IconWell } from "../../src/NSE/Components/IconWell";
import { LoadingSpinner } from "../../src/NSE/Components/LoadingSpinner";
import { NSEProgressIndicator } from "../../src/NSE/Progress/NSEProgressIndicator";
import { Spinner } from "../../src/NSE/Progress/spinnerSprite";
import { AnimationEnvironmentProvider } from "../../src/NSE/Animation/NSEAnimationEnvironment";
import { AboutDialog, NSEConfirmDialog } from "../../src/NSE/Components/NSESystemDialogs";
import { ContainerPane } from "../../src/NSE/Containers/NSEContainers";
import { synCloudOSLogoUrl } from "../../src/SynCloudOS/Resources/frameworkAssets";
import { SystemUILayer } from "../../src/Webspring/SystemUILayer";
import { createTestBundle, createTestRuntime, registerTestSynWare } from "./helpers";
import { WSBoardViewController, createWSFolderSplitPresentation, WSFolderTileView, WSIconArtwork, type WSFolderItem } from "../../src/Webspring/public";
import { createTestWebspring } from "./webspringTestShell";
import { WebspringFolderAppearanceProvider } from "../../src/Webspring/WebspringFolderAppearance";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { AppViewContent } from "../../src/Webspring/AppViewContent";
import { NotificationCentrePresenter } from "../../src/Webspring/NotificationCentrePresenter";
import { SystemStartupLayer } from "../../src/Webspring/SystemStartupLayer";
import { WSDragProxy } from "../../src/Webspring/WSDragProxy";
import { WSWidgetShelfView } from "../../src/Webspring/WSWidgetShelfView";
import { WSSurface } from "../../src/Webspring/WSSurface";
import { WSWidget, captureWSWidgetClass } from "../../src/Webspring/WSWidget";
import { CapabilitiesPane } from "../../src/Webspring/Preferences/Capabilities.prefPane";
import { StoragePane } from "../../src/Webspring/Preferences/Storage.prefPane";
import { UpdateReadinessDetails } from "../../src/Webspring/Preferences/Updates.prefPane";
import { GlassPanel } from "../../src/NSE/Components/GlassPanel";
import { LinenSurface } from "../../src/NSE/Components/LinenSurface";
import { NSESlider } from "../../src/NSE/Controls/Values/NSESlider";
import { ToolbarView } from "../../src/NSE/Toolbars/ToolbarView";
import { GraphicalClock } from "../../src/NSE/DateTime/Calendar/graphicalClock";
import { Chronosphere } from "../../src/NSE/Chronosphere/Chronosphere";
import { ChronosphereGridView } from "../../src/NSE/Chronosphere/ChronosphereGridView";
import { ChronosphereStage, type ChronospherePlatformPort } from "../../src/NSE/Chronosphere/ChronosphereStage";
import { ChronosphereEnvironmentProvider, type ChronosphereEnvironment } from "../../src/NSE/Chronosphere/chronosphereEnvironment";
import { createChronosphereAppSubject } from "../../src/NSE/Chronosphere/chronosphereSubject";
import { defaultChronosphereLabels } from "../../src/NSE/Chronosphere/chronosphereViewTypes";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSEBox, NSESwitch } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSEPopUpButton } from "../../src/NSE/Menus/NSEPopUpButton";
import { PageCurlLeaf } from "../../src/NSE/Page/PageCurlLeaf";

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
it("renders the switch and slider tracking states during pointer interaction", () => {
  const view = render(<Host>
    <NSESwitch aria-label="Sync" />
    <NSESlider aria-label="Level" value={50} />
    <NSESlider aria-label="Angle" sliderType="circular" value={50} onValueChange={() => {}} />
  </Host>);
  for (const control of [view.getByRole("switch"), view.getByRole("slider", { name: "Level" }), view.getByRole("slider", { name: "Angle" })]) {
    Object.assign(control, { setPointerCapture() {}, hasPointerCapture: () => false });
    const root = control.closest("[data-nse-control]")!;
    fireEvent.pointerDown(control, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    expect(root.getAttribute("data-nse-highlighted")).toBe("");
    expect(root.getAttribute("data-nse-tracking")).toBe("true");
    collect();
    fireEvent.pointerCancel(control, { pointerId: 1 });
    expect(root.hasAttribute("data-nse-highlighted")).toBe(false);
    expect(root.getAttribute("data-nse-tracking")).toBe("false");
  }
  collect();
});

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
it("renders the retained navigation overflow page", async () => {
  const id = "theme-contract-overflow";
  const controller = new TabBarController<React.ReactNode>({
    id,
    owner: nseUnowned,
    destinations: ["Documents", "Pictures", "Music", "Movies", "Downloads", "Settings"].map(label => ({
      id: label.toLowerCase(),
      label,
      icon: { kind: "template" as const, name: label.toLowerCase() },
      createContent: () => <p>{label}</p>,
    })),
  });
  try {
    const view = render(
      <Host>
        <TabBar controller={controller} idScope={id} aria-label="Workspace" />
        <TabBarOverflowList controller={controller} idScope={id} aria-label="Workspace" />
      </Host>,
    );
    const more = view.getByRole("tab", { name: "More destinations" });
    more.focus();
    fireEvent.keyDown(more, { key: "ArrowDown" });
    const region = await view.findByRole("region", { name: "More destinations" });
    expect(region.closest('[data-nse-control="tab-view"][data-nse-part="overflow"][data-nse-style="navigation"]')).not.toBeNull();
    collect();
  } finally {
    cleanup();
    controller.dispose();
  }
});
it("renders the stack overflow's disabled fallback action", () => {
  const view = render(
    <Host>
      <NSEStackView availableSize={100} overflowLabel="More actions">
        <NSEStackItem id="save" preferredSize={64} visibilityPriority={100}>Save</NSEStackItem>
        <NSEStackItem id="export" preferredSize={64} visibilityPriority={0} aria-disabled overflowLabel="Export" onOverflowActivate={() => undefined}>Export</NSEStackItem>
      </NSEStackView>
    </Host>,
  );
  const trigger = view.getByRole("button", { name: "More actions" });
  expect(trigger.getAttribute("data-nse-part")).toBe("button");
  fireEvent.click(trigger);
  const menu = view.getByRole("dialog", { name: "More actions overflow" });
  expect(menu.getAttribute("data-nse-part")).toBe("menu");
  expect(menu.querySelector('[data-nse-part="item"][data-nse-enabled="false"]')?.textContent).toBe("Export");
  collect();
});
it("renders the listbox fade edges as the viewport scrolls", async () => {
  render(<Host><ListboxPopup id="theme-contract-listbox" defaultOpen options={[{ id: "one", label: "First" }, { id: "two", label: "Second", separatorBefore: true }]} /></Host>);
  const viewport = await waitFor(() => {
    const element = document.querySelector<HTMLElement>('#theme-contract-listbox [data-nse-part="viewport"]');
    expect(element).not.toBeNull();
    return element!;
  });
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 400 },
  });
  for (const [position, edge] of [[0, "maxY"], [100, "both"], [300, "minY"]] as const) {
    viewport.scrollTop = position;
    fireEvent.scroll(viewport);
    expect(viewport.getAttribute("data-nse-edge")).toBe(edge);
    collect();
  }
});
it("renders both framed popover transparency states", async () => {
  function FramedPopover({ drawsBackground }: { drawsBackground: boolean }) {
    const [anchor, setAnchor] = React.useState<HTMLButtonElement | null>(null);
    return <>
      <button ref={setAnchor} type="button">Options</button>
      <NSEPopover id="theme-contract-popover" open surface="overlay" anchor={anchor} parentWindowControllerId={null} drawsBackground={drawsBackground}>
        <p>Popover content</p>
      </NSEPopover>
    </>;
  }
  const view = render(<Host><FramedPopover drawsBackground /></Host>);
  const selector = '[data-nse-control="popover"][data-nse-part="surface"]';
  await waitFor(() => expect(document.querySelector(selector)?.getAttribute("data-nse-transparent")).toBe("false"));
  collect();
  view.rerender(<Host><FramedPopover drawsBackground={false} /></Host>);
  await waitFor(() => expect(document.querySelector(selector)?.getAttribute("data-nse-transparent")).toBe("true"));
  collect();
});
it("renders a local modal overlay backdrop beside its surface", async () => {
  render(<Host><NSEPopup id="theme-contract-overlay" defaultOpen modal title="Overlay"><p>Overlay content</p></NSEPopup></Host>);
  const backdrop = await waitFor(() => {
    const element = document.getElementById("theme-contract-overlay")?.previousElementSibling;
    expect(element).not.toBeNull();
    return element!;
  });
  expect(backdrop.getAttribute("data-nse-part")).toBe("backdrop");
  expect(backdrop.getAttribute("data-nse-role")).toBe("overlay");
  expect(backdrop.hasAttribute("hidden")).toBe(false);
  collect();
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
it.each(["menu", "popover"] as const)("renders the %s overlay phase hooks", async kind => {
  const fixture = (open: boolean) => <Host><NSEPopup id="theme-contract-overlay-phase" overlayKind={kind} open={open} exitDuration={1000} /></Host>;
  const view = render(fixture(true));
  const surface = await waitFor(() => {
    const element = document.getElementById("theme-contract-overlay-phase");
    expect(element?.getAttribute("data-nse-overlay-state")).toBe("open");
    return element!;
  });
  collect();
  view.rerender(fixture(false));
  expect(surface.getAttribute("data-nse-overlay-state")).toBe("closing");
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
  expect(view.container.querySelector('[data-nse-control="window"][data-nse-presentation="stage"] [data-nse-part="content-border"][data-nse-content-border="large"]')).not.toBeNull();
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
        <article data-nse-part="document"><p>Documents</p></article>
      </WindowView>
    </Host>,
  );
  const titlebar = view.container.querySelector('[data-nse-part="surface"][data-nse-role="titlebar"]');
  expect(titlebar?.getAttribute("data-nse-presentation")).toBe("floating");
  expect(titlebar?.getAttribute("data-nse-transparent")).toBe("true");
  expect(titlebar?.getAttribute("data-nse-type")).toBe("custom");
  expect(titlebar?.querySelector('[data-nse-part="floating-titlebar"]')).not.toBeNull();
  expect(view.container.querySelector('[data-nse-control="window"] [data-nse-part="document"]')).not.toBeNull();
  collect();
});
it.each([true, false])("renders both dividers of a three-pane split view (vertical=%s)", (isVertical) => {
  const controller = new NSESplitViewController({
    id: "theme-contract-split",
    isVertical,
    splitViewItems: ["Sources", "Documents", "Inspector"].map(title => new NSESplitViewItem({
      identifier: title.toLowerCase(),
      viewController: new TestContentViewController(title, () => <p>{title}</p>),
    })),
  });
  try {
    const view = render(<Host><ViewControllerView controller={controller} /></Host>);
    updateTraits(controller, createStaticPresentationTraits({ width: 1000, height: 800, reducedMotion: true }));
    const orientation = isVertical ? "horizontal" : "vertical";
    expect(view.container.querySelectorAll(`[data-nse-part="split-divider"][data-nse-orientation="${orientation}"]`)).toHaveLength(2);
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
      this.window.toolbar = new NSEToolbar({
        identifier: "main",
        items: [{ id: "share", kind: "command", commandId: "share", label: "Share", paletteLabel: "Share", icon: "S", backgroundTintColour: "#c8102e" }],
        defaultItemIdentifiers: ["share"],
      });
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
it("renders runtime and login drawing hooks", async () => {
  const runtime = createSynCloudOS({ id: "contract-login", environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "required" });
  await runtime.boot({ initialPathname: "/" });
  try {
    const view = render(<Host><SynCloudOSProvider runtime={runtime}><RuntimeInputBoundary>
      <HostLoginGate runtime={runtime} snapshot={runtime.store.getSnapshot()} authentication="required" />
      <LoginWindow methods={[{ id: "example", label: "Continue", iconUrl: "/example.svg" }]} />
      <LoginField label="Account" invalid />
      <LoginCheckbox label="Remember me" disabled />
    </RuntimeInputBoundary></SynCloudOSProvider></Host>);
    expect(view.container.querySelector('[data-nse-control="login-window"][data-nse-part="backdrop"]')).not.toBeNull();
    expect(view.container.querySelector('[data-nse-control="view"][data-nse-role="runtime"]')).not.toBeNull();
    collect();
  } finally {
    cleanup();
    await runtime.dispose("contract test finished");
  }
});

it("renders attached file panels and media collection drawing hooks", async () => {
  const noop = () => undefined;
  const media = { id: "photo", providerId: "contract", kind: "image" as const, name: "Photograph", mimeType: "image/png", source: "/photo.png" };
  const photograph = { id: media.id, name: media.name, kind: "media" as const, media };
  const preview = {
    state: "ready", src: "/photo.png", revision: 0,
    intrinsicSize: { width: 160, height: 120 }, subscribe: () => noop, ready: Promise.resolve(), release: noop,
  } as unknown as IFXImageResource;
  const view = render(<Host>
    <OpenPanelSheetSurface compact={false} onClose={noop} request={{
      id: "contract-attached-open", title: "Open", role: "sheet", parentWindowControllerId: null,
      anchor: null, bounds: { x: 0, y: 0, width: 640, height: 400 },
    }}>
      <OpenPanelSources id="contract-sources" groups={[{ id: "local", name: "Local", children: [
        { id: "documents", name: "Documents", locked: true },
      ] }]} selectedId={null} onSelect={noop} />
      <OpenPanelCollection items={[photograph]} selectedIds={new Set([photograph.id])} multiple={false} compact={false}
        width={360} height={180} title="Files" images={{ load: () => preview }} onSelect={noop} onActivate={noop} />
    </OpenPanelSheetSurface>
    <MediaCollectionPresenter items={[{ id: "recording", providerId: "contract", kind: "audio", name: "Recording", mimeType: "audio/ogg" }]}
      selectedIds={new Set()} selection="single" direction="ltr" onSelectionChange={noop} onActivate={noop} />
  </Host>);
  expect(view.container.querySelector('[data-nse-control="open-panel"][data-nse-part="sheet"]')).not.toBeNull();
  expect(view.getByText("Recording")).toBeTruthy();
  expect((await view.findByRole("img", { name: "Needs permission" })).getAttribute("data-nse-part")).toBe("notice");
  await waitFor(() => expect(view.container.querySelector('[data-nse-part="image"][data-nse-style="thumbnail"]')).not.toBeNull());
  collect();
});

it("renders selected icon, light spinner, pane subtitle and keyboard toolbar", async () => {
  const view = render(
    <Host>
      <IconWell active><img src={synCloudOSLogoUrl} alt="" /></IconWell>
      <LoadingSpinner variant="light" label="Loading example" />
      <ContainerPane title="Options" subtitle="More settings" variant="surface"><p>Pane content</p></ContainerPane>
      <ToolbarView composition="children" fadeOnKeyboard><input type="text" aria-label="Search" /></ToolbarView>
    </Host>,
  );
  expect(view.container.querySelector('[data-nse-control="icon-well"][data-nse-selected]')).not.toBeNull();
  expect(view.getByRole("status", { name: "Loading example" }).getAttribute("data-nse-background-style")).toBe("emphasised");
  expect(view.getByText("More settings").getAttribute("data-nse-part")).toBe("subtitle");
  const field = view.getByRole("textbox", { name: "Search" });
  act(() => field.focus());
  await waitFor(() => expect(view.getByRole("toolbar").getAttribute("data-nse-presentation")).toBe("keyboard"));
  collect();
});

it("renders both motion and visibility states of progress indicators", () => {
  let notify: (isIntersecting: boolean) => void = () => { throw new Error("The spinner did not observe its visibility."); };
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {
      notify = isIntersecting => callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() {}
  });
  try {
    const view = render(<>
      <AnimationEnvironmentProvider reducedMotion={true}><NSEProgressIndicator aria-label="Static" /></AnimationEnvironmentProvider>
      <AnimationEnvironmentProvider reducedMotion={false}><NSEProgressIndicator aria-label="Animated" /></AnimationEnvironmentProvider>
      <Spinner tone="dark" />
    </>);
    expect(view.getByRole("progressbar", { name: "Static" }).getAttribute("data-nse-motion")).toBe("static");
    expect(view.getByRole("progressbar", { name: "Animated" }).getAttribute("data-nse-motion")).toBe("animated");
    const spinner = view.getByRole("status");
    notify(false);
    expect(spinner.classList.contains("nse:suspended=true")).toBe(true);
    collect();
    notify(true);
    expect(spinner.classList.contains("nse:suspended=false")).toBe(true);
    collect();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});

it("renders the About and confirmation artwork", async () => {
  const about = render(
    <Host>
      <AboutDialog
        open
        appearance="dark"
        info={{
          name: "SynCloudOS",
          version: "1.0.0",
          tagline: "Your workspace",
          copyright: "© Syndromatic Ltd.",
          trademark: "SynCloudOS",
          iconSrc: synCloudOSLogoUrl,
          iconAlt: "SynCloudOS logo",
        }}
        onDismiss={() => undefined}
      />
    </Host>,
  );
  expect((await about.findByRole("img", { name: "SynCloudOS logo" })).getAttribute("data-nse-part")).toBe("image");
  collect();
  cleanup();

  render(
    <Host>
      <NSEConfirmDialog open title="Delete document?" message="This action cannot be undone." iconSrc={synCloudOSLogoUrl}
        confirmLabel="Delete" cancelLabel="Cancel" onConfirm={() => undefined} onCancel={() => undefined} />
    </Host>,
  );
  await waitFor(() => expect(document.querySelector('[data-nse-control="system-alert"][data-nse-part="background"] [data-nse-part="image"] > img[data-nse-part="image"]')).not.toBeNull());
  collect();
});

it("renders empty and muted Notification preferences", async () => {
  const runtime = createTestRuntime({ id: "theme-contract-preferences" });
  try {
    runtime.appearance.set("dark");
    runtime.settings.set("notificationsEnabled", false);
    runtime.systemUI.preferences.open("notifications");
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary><SystemUILayer onLogOut={() => undefined} /></RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    expect((await view.findByText("No Apps Yet")).closest('[data-nse-part="status"]')?.getAttribute("data-nse-role")).toBe("empty");
    expect(view.getByRole("button", { name: "Back" }).getAttribute("data-nse-role")).toBe("back");
    collect();

    await act(async () => {
      registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.preferences", version: "1.0.0", displayName: "Example App", services: [{ id: "notifications", required: true }] });
    });
    const note = await view.findByText(/All notifications are turned off/u);
    expect(note.getAttribute("data-nse-role")).toBe("note");
    expect(note.closest('[data-nse-role="notifications"]')?.getAttribute("data-nse-state")).toBe("off");
    expect(view.getByText(/View notifications from/u).getAttribute("data-nse-role")).toBe("lead-note");
    collect();
  } finally {
    cleanup();
    await runtime.dispose("theme contract preferences specimen completed");
  }
});

it("renders the outline source-list rail, group label and separators", () => {
  type Entry = { readonly id: string; readonly children: readonly Entry[] };
  const controller = new NSETreeController<Entry, string>({
    owner: nseUnowned,
    id: "theme-outline-source-list",
    content: [{ id: "Library", children: [{ id: "Documents", children: [] }, { id: "Pictures", children: [] }] }],
    getId: entry => entry.id,
    getChildren: entry => entry.children,
    withChildren: (entry, children) => ({ ...entry, children }),
    selection: { mode: "single", allowsEmpty: true },
  });
  try {
    controller.expand("Library");
    const view = render(<Host><NSEOutlineView
      aria-label="Library sidebar"
      controller={controller}
      selectionHighlightStyle="sourceList"
      idForItem={entry => entry.id}
      childrenForItem={entry => entry.children}
      labelForItem={entry => entry.id}
      delegate={{ isGroupItem: id => id === "Library" }}
    /></Host>);
    const rail = view.container.querySelector('[data-nse-control="outline-view"][data-nse-part="sidebar"]');
    expect(rail?.querySelector('[data-nse-part="group-row"] > [data-nse-part="label"]')?.textContent).toBe("Library");
    expect(rail?.querySelector('[data-nse-part="group-row"] > [data-nse-part="separator"]')).not.toBeNull();
    expect(rail?.querySelector('[data-nse-part="group"][data-nse-role="children"]')).not.toBeNull();
    collect();
  } finally {
    cleanup();
    controller.dispose();
  }
});

it("renders the selected Cover Flow title and subtitle", () => {
  const covers = [{ id: "cover", title: "Quayside" }];
  const controller = new NSEArrayController({
    id: "theme-cover-flow",
    content: covers,
    getId: cover => cover.id,
    selection: { mode: "single", allowsEmpty: false, preservesSelection: true },
  });
  controller.select(["cover"]);
  try {
    const image = { src: "/cover.png", pixelLease: () => new Promise(() => undefined) } as unknown as IFXImageResource;
    const view = render(<Host><NSECollectionView
      aria-label="Albums"
      adapter={{ controller, idForItem: cover => cover.id, labelForItem: cover => cover.title }}
      layout={createCoverFlowCollectionLayout({})}
      imageForItem={() => image}
      subtitleForItem={() => "Photo album"}
    /></Host>);
    const flow = view.getByRole("listbox", { name: "Albums" });
    expect(flow.getAttribute("data-nse-style")).toBe("cover-flow");
    expect(flow.querySelector('[data-nse-part="title"] > [data-nse-part="primary-text"]')?.textContent).toBe("Quayside");
    expect(flow.querySelector('[data-nse-part="title"] > [data-nse-part="subtitle"]')?.textContent).toBe("Photo album");
    collect();
  } finally {
    cleanup();
    controller.dispose();
  }
});

it("renders rule-editor groups, alternate rows and validation errors", () => {
  type Person = { readonly age: number };
  const schema = { id: "theme-rules", fields: { age: { type: "number" as const, read: (person: Person) => person.age } } };
  const rule = { kind: "comparison", field: "age", operator: "equals", value: 24 } as const;
  const view = render(<Host><NSEPredicateEditor<Person>
    aria-label="People search"
    schema={schema}
    value={{ kind: "compound", operator: "all", children: [
      { kind: "compound", operator: "any", children: [rule] },
      rule,
    ] }}
  /></Host>);
  const editor = view.container.querySelector('[data-nse-control="rule-editor"]');
  expect(editor?.querySelector('[data-nse-part="group"]')).not.toBeNull();
  expect(editor?.querySelector('[data-nse-part="row"][data-nse-style="alternating"]')).not.toBeNull();
  fireEvent.change(view.getByLabelText("Value 2"), { target: { value: "invalid" } });
  expect(editor?.querySelector('[data-nse-part="error"]')).not.toBeNull();
  collect();

  view.rerender(<Host><NSEPredicateEditor<Person> aria-label="People search" schema={schema} value={rule} /></Host>);
  fireEvent.change(view.getByLabelText("Value"), { target: { value: "invalid" } });
  expect(view.container.querySelector('[data-nse-control="predicate-editor"] > [data-nse-part="error"]')).not.toBeNull();
  collect();
});

it("renders the image editor crop guides", () => {
  const image = {
    state: "ready", src: "/landscape.png", revision: 1, accessibleLabel: "Landscape",
    intrinsicSize: { width: 200, height: 100 }, subscribe: () => () => undefined,
  } as unknown as IFXImageResource;
  const view = render(<Host><IFXImageView image={image} currentToolMode="crop" geometry={{
    measure: () => ({ width: 100, height: 100 }),
    observe: () => () => undefined,
  }} /></Host>);
  expect(view.container.querySelector('[data-nse-control="image-view"][data-nse-style="editor"] > [data-nse-part="decoration"][data-nse-role="crop"]')).not.toBeNull();
  collect();
});

it.each(["contact", "curved"] as const)("renders a selected image attachment with a %s shadow", kind => {
  const run = attachmentRun({
    id: "photo", kind: "image", source: { kind: "document-resource", resourceId: "photo-asset" }, alt: "A photo",
    bounds: { width: 200, height: 150 },
    appearance: { shadow: { kind, colour: "#000000", blur: 10, offset: 2, opacity: 0.6, angle: 270 } },
  });
  const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("Before "), run, textRun(" after")])]) });
  const session = new TextEditingSession({ id: "theme-attachment", textOwner: owner });
  const view = render(<Host><NSETextView session={session} label="Document" attachmentResolver={() => ({
    src: "data:image/png;base64,iVBORw0KGgo=", naturalWidth: 200, naturalHeight: 150,
  })} /></Host>);
  act(() => session.select(7, 8));
  const attachment = view.container.querySelector('[data-nse-part="attachment"][data-nse-selected]');
  expect(attachment?.querySelector(`[data-nse-part="shadow"][data-nse-shadow="${kind}"]`)).not.toBeNull();
  expect(attachment?.querySelectorAll('[data-nse-part="handle"]')).toHaveLength(8);
  collect();
});

it("renders material surfaces, focus treatments and metal slider parts", () => {
  const view = render(<Host>
    <GlassPanel tabIndex={0} smoothSurface={{ focus: "within" }}>Glass</GlassPanel>
    <LinenSurface tabIndex={0} smoothSurface={{ focus: "inset" }}>Linen</LinenSurface>
    <NSESlider aria-label="Volume" minimum={0} maximum={100} defaultValue={50} thumbMaterial="metal" />
  </Host>);
  expect(view.getByText("Glass").getAttribute("data-nse-focus-style")).toBe("within");
  expect(view.getByText("Linen").getAttribute("data-nse-focus-style")).toBe("inset");
  expect(view.getByRole("slider").closest('[data-nse-control="slider"]')?.querySelector('[data-nse-part="knob"][data-nse-material="metal"]')).not.toBeNull();
  collect();
});

it("renders the optional analogue second hand", () => {
  const view = render(<Host><div data-nse-control="date-picker">
    <GraphicalClock aria-label="Clock" locale="en-GB" timeZone="Europe/London" date={{ year: 2026, month: 11, day: 18 }}
      value={{ hour: 13, minute: 30, second: 15 }} showSeconds onValueChange={() => undefined} />
  </div></Host>);
  expect(view.container.querySelector('[data-nse-part="second-hand"]')).not.toBeNull();
  collect();
});

it("renders both states of the Webspring Board pager", async () => {
  const bundles = ["alpha", "beta"].map(name => createTestBundle({
    bundleIdentifier: `com.example.theme-board.${name}`, displayName: name, policy: { public: true },
  }));
  const runtime = createTestRuntime({ id: "theme-contract-board", authenticationPolicy: "disabled", initialBundles: bundles });
  class OneIconBoard extends WSBoardViewController { static override pageSize = 1; }
  const shell = createTestWebspring({
    info: { bundleIdentifier: "com.example.theme-board.shell", displayName: "Theme Board", branding: { name: { key: "contract.name", fallback: "Theme Board" } } },
    launcher: OneIconBoard,
  });
  await runtime.boot({ initialPathname: "/" });
  try {
    const view = render(<Host><SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider></Host>);
    const first = await view.findByRole("button", { name: "Show application page 1" });
    const second = view.getByRole("button", { name: "Show application page 2" });
    expect(first.getAttribute("data-nse-selected")).toBe("");
    expect(second.hasAttribute("data-nse-selected")).toBe(false);
    expect(first.parentElement?.getAttribute("data-nse-role")).toBe("page-controls");
    collect();
    fireEvent.click(second);
    expect(second.getAttribute("data-nse-selected")).toBe("");
    collect();
  } finally {
    cleanup();
    await runtime.dispose("theme contract Board specimen completed");
  }
});

it("renders the measured textured folder receptacle and the icon artwork's glow", () => {
  const folder: WSFolderItem = {
    kind: "folder",
    id: "folder.tools",
    title: "Tools",
    apps: [],
    badgeCount: 0,
  };
  const dimensions = (["offsetWidth", "offsetHeight"] as const).map(name => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)!] as const);
  for (const [name, descriptor] of dimensions) {
    Object.defineProperty(HTMLElement.prototype, name, {
      ...descriptor,
      get(this: HTMLElement) {
        return this.matches('[data-nse-control="folder-tile"]') ? 60 : descriptor.get?.call(this);
      },
    });
  }
  try {
    const view = render(
      <Host>
        <WebspringFolderAppearanceProvider value={{ shape: { kind: "circle" }, fill: { kind: "texture", image: synCloudOSLogoUrl, size: "cover", colour: "#20242c" } }}>
          <WSFolderTileView folder={folder} dropTarget />
        </WebspringFolderAppearanceProvider>
        <IconWell active><WSIconArtwork src={synCloudOSLogoUrl} /></IconWell>
      </Host>,
    );
    const tile = view.container.querySelector('[data-nse-control="folder-tile"][data-nse-style="circle"][data-nse-type="texture"][data-nse-highlighted]');
    expect(tile?.querySelector('[data-nse-part="indicator"] [data-nse-part="shadow"]')).not.toBeNull();
    expect(view.container.querySelector('[data-nse-control="icon-well"] [data-nse-role="artwork"] > [data-nse-part="shadow"]')).not.toBeNull();
    collect();
  } finally {
    cleanup();
    for (const [name, descriptor] of dimensions) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});

for (const reducedMotion of [false, true]) {
  const style = reducedMotion ? "fade" : "split";
  it("renders the folder " + style + " states and stage copy roles", async () => {
    const appId = (name: string) => "com.example.theme-folder." + name.toLowerCase();
    const runtime = createTestRuntime({
      id: "theme-contract-folder-" + style,
      authenticationPolicy: "disabled",
      initialBundles: ["Documents", "Pictures", "Music"].map(name => createTestBundle({
        bundleIdentifier: appId(name), displayName: name, policy: { public: true },
      })),
    });
    const Split = createWSFolderSplitPresentation();
    const shell = createTestWebspring({
      info: {
        bundleIdentifier: "com.example.theme-folder.shell",
        displayName: "Theme Folder",
        branding: { name: { key: "theme.folder", fallback: "Theme Folder" } },
        folders: {
          editable: true,
          initial: [{ id: "folder.tools", title: { key: "theme.folder.tools", fallback: "Tools" }, order: 1, apps: [appId("Pictures"), appId("Music")] }],
        },
      },
      folderPresentation: props => <Split {...props} reducedMotion={reducedMotion} />,
    });
    try {
      await runtime.boot({ initialPathname: "/" });
      const view = render(<Host><SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} startupPhase="complete" /></SynCloudOSProvider></Host>);
      fireEvent.click(await view.findByRole("button", { name: "Open folder Tools" }));
      const split = await waitFor(() => {
        const element = view.container.querySelector<HTMLElement>('[data-nse-control="folder-presentation"][data-nse-part="background"]');
        expect(element).not.toBeNull();
        return element!;
      });
      expect(split.dataset.nseStyle).toBe(style);
      collect();
      await waitFor(() => expect(split.dataset.nsePresentation).toBe("open"));
      const copies = split.querySelectorAll('[data-nse-part="preview"] [data-nse-control="board"]');
      expect(copies).toHaveLength(3);
      for (const copy of copies) {
        expect(copy.querySelector('[data-nse-control="app-icon"][data-nse-role="anchor"]')).not.toBeNull();
        expect(copy.querySelector('[data-nse-control="app-icon"][data-nse-role="backdrop"]')).not.toBeNull();
      }
      collect();
      fireEvent.keyDown(view.getByRole("dialog", { name: "Tools" }), { key: "Escape" });
      expect(split.dataset.nsePresentation).toBe("closing");
      collect();
    } finally {
      cleanup();
      await runtime.dispose("theme contract folder specimen completed");
    }
  });
}

it("renders the boot material and an appearance-projected drag proxy", async () => {
  const runtime = createTestRuntime({ id: "theme-contract-startup" });
  try {
    const view = render(<Host><SynCloudOSProvider runtime={runtime}>
      <SystemStartupLayer phase="material" />
      <WSDragProxy point={{ x: 80, y: 100 }} app={{
        bundleIdentifier: "com.example.archive", displayName: "Archive", iconUrl: "/archive.png",
        route: "/archive", selected: true, running: false, state: "idle",
        badgeCount: 0, accent: "#224466", featured: false,
      }} />
    </SynCloudOSProvider></Host>);
    expect(view.container.querySelector('[data-nse-role="startup"] > [data-nse-role="startup-material"]')).not.toBeNull();
    const proxy = document.body.querySelector(':scope > [data-nse-control="view"][data-nse-part="preview"][data-nse-role="drag-proxy"]');
    expect(proxy?.hasAttribute("data-nse-theme")).toBe(true);
    expect(proxy?.querySelector(':scope > [data-nse-part="image"]')).not.toBeNull();
    expect(proxy?.querySelector(':scope > [data-nse-part="title"]')?.textContent).toBe("Archive");
    collect();
  } finally {
    cleanup();
    await runtime.dispose("theme contract startup specimen completed");
  }
});

it.each([["incoming", "system", true], ["outgoing", "none", false]] as const)(
  "renders the %s app plane and its %s body",
  (role, background, hasTitlebar) => {
    const view = render(<Host><AppViewChrome.Root zIndex={1} multiSwitchRole={role}>
      <AppViewChrome.Surface material="metal" hasTitlebar={hasTitlebar} multiSwitchRole={role}>
        <AppViewContent.Surface smoothSurface={false} background={background}><p>App content</p></AppViewContent.Surface>
      </AppViewChrome.Surface>
    </AppViewChrome.Root></Host>);
    expect(view.container.querySelector(`[data-nse-control="window"][data-nse-presentation="stage"] > [data-nse-part="content"][data-nse-transition="${role}"] > [data-nse-part="content-view"][data-nse-background-style="${background}"]`)).not.toBeNull();
    collect();
  },
);

it("renders the widget shelf material overlay and its loading status", async () => {
  const runtime = createTestRuntime({ id: "theme-contract-widget" });
  class ArchiveWidget extends WSWidget<readonly string[]> {
    static override id = "archive";
    static override title = "Archive";
    static override whenEmpty = "hide" as const;
    override load() { return new Promise<readonly string[]>(() => undefined); }
    override renderView() { return null; }
  }
  const widget = captureWSWidgetClass(ArchiveWidget);
  try {
    const view = render(<Host><SynCloudOSProvider runtime={runtime}><WSWidgetShelfView entries={[{
      widget, title: "Archive", iconUrl: "/archive.png", emptyMessage: null,
    }]} surface={WSSurface.plain("#101418")} /></SynCloudOSProvider></Host>);
    const shelf = view.getByRole("region", { name: "Widgets" });
    expect(shelf.getAttribute("data-nse-role")).toBe("widget-shelf");
    expect(shelf.querySelector(':scope > [data-nse-part="decoration"][data-nse-role="material"]')).not.toBeNull();
    expect(shelf.querySelector('[data-nse-part="header"] > [data-nse-part="image"]')).not.toBeNull();
    expect(view.getByRole("status").getAttribute("data-nse-part")).toBe("status");
    collect();
  } finally {
    cleanup();
    await runtime.dispose("theme contract widget specimen completed");
  }
});

it("renders the notification cube faces, priority and action states", async () => {
  const runtime = createTestRuntime({ id: "theme-contract-notification" });
  const setting = "SynCloudOS4:debug.notificationScreenCapture";
  const previous = window.localStorage.getItem(setting);
  window.localStorage.setItem(setting, "disabled");
  try {
    await runtime.notifications.post({
      kind: "system", title: "Backup finished", message: "Archived documents are safe.", priority: "timeSensitive",
      actions: [{ id: "dismiss", kind: "dismiss", label: "Dismiss backup", primary: true, destructive: true }],
    });
    const view = render(<Host><SynCloudOSProvider runtime={runtime}><NotificationCentrePresenter
      snapshot={runtime.store.getSnapshot()} openRequest={null}
    /></SynCloudOSProvider></Host>);
    const action = await view.findByRole("button", { name: "Dismiss backup" });
    expect(action.getAttribute("data-nse-style")).toBe("primary");
    expect(action.getAttribute("data-nse-has-destructive-action")).toBe("true");
    expect(view.container.querySelector('[data-nse-part="bezel"][data-nse-level="timeSensitive"]')).not.toBeNull();
    expect(view.container.querySelector('[data-nse-part="face"][data-nse-role="screen"]')).not.toBeNull();
    expect(view.container.querySelector('[data-nse-part="face"][data-nse-role="underside"]')).not.toBeNull();
    collect();
  } finally {
    if (previous === null) window.localStorage.removeItem(setting);
    else window.localStorage.setItem(setting, previous);
    cleanup();
    await runtime.dispose("theme contract notification specimen completed");
  }
});

it("renders the system observation preference panes", async () => {
  const runtime = createTestRuntime({ id: "theme-contract-observations" });
  try {
    const view = render(<Host><SynCloudOSProvider runtime={runtime}>
      <CapabilitiesPane />
      <StoragePane />
      <UpdateReadinessDetails snapshot={runtime.updateReadiness.getSnapshot()} />
    </SynCloudOSProvider></Host>);
    for (const role of ["capabilities", "storage", "updates"]) {
      expect(view.container.querySelector(`[data-nse-control="view"][data-nse-part="content"][data-nse-role="${role}"]`)).not.toBeNull();
    }
    collect();
  } finally {
    cleanup();
    await runtime.dispose("theme contract observations specimen completed");
  }
});

const contractArchive = createChronosphereAppSubject("contract-archive", "Versions", [
  { id: "current", sequence: 2, title: "Current draft", dateLabel: "Today", displayLabel: "Current", summary: "Present version", isCurrent: true },
  { id: "saved", sequence: 1, title: "Saved draft", dateLabel: "Yesterday", displayLabel: "Saved", summary: "Earlier version" },
], { card: { aspectRatio: 1.6, material: "paper" } });
function contractArchiveEnvironment(signal: AbortSignal): ChronosphereEnvironment {
  return {
    signal,
    images: { load() { throw new Error("Contract specimen uses the still-image fallback"); } },
    mediaQueries: { getSnapshot: () => true, subscribe: () => () => {} },
    scheduler: {
      requestAnimationFrame(callback) {
        const id = window.requestAnimationFrame(callback);
        return { dispose: () => window.cancelAnimationFrame(id) };
      },
      setTimeout(callback, delayMs) {
        const id = window.setTimeout(callback, delayMs);
        return { dispose: () => window.clearTimeout(id) };
      },
    },
    animations: {
      acquireOwner: viewId => ({ viewId, dispose() {} }),
      animate: () => ({ progress: 1, finished: Promise.resolve(), dispose() {} }),
    },
  };
}

it("renders the archive preparation, grid, timeline and version detail hooks", async () => {
  const controller = new AbortController();
  const environment = contractArchiveEnvironment(controller.signal);
  const stageEnvironment: ChronospherePlatformPort = {
    matchMedia: () => ({ matches: true, subscribe: () => () => {}, dispose() {} }),
    requestAnimationFrame: callback => window.requestAnimationFrame(callback),
    cancelAnimationFrame: handle => window.cancelAnimationFrame(handle as number),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: handle => window.clearTimeout(handle as number),
  };
  const view = render(<Host><ChronosphereEnvironmentProvider value={environment}>
    <Chronosphere subject={contractArchive} view={ChronosphereGridView} capturePresent={() => new Promise(() => {})} onReturn={() => {}} />
    <ChronosphereGridView model={{
      subject: contractArchive, entries: contractArchive.entries, labels: defaultChronosphereLabels,
      presentImage: null, foregroundImage: null, presentRect: null, prepared: undefined,
    }} actions={{ exit() {} }} />
    <ChronosphereStage subject={contractArchive} environment={stageEnvironment} immediate
      DetailFocusScopeComponent={({ children }) => <>{children}</>} PushButtonComponent={NSEButton} />
  </ChronosphereEnvironmentProvider></Host>);
  try {
    const stack = document.querySelector('[data-nse-control="chronosphere"][data-nse-style="stack"]');
    const card = stack?.querySelector('[data-nse-part="cell"][data-nse-role="stack"][data-nse-selected]');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    await waitFor(() => expect(stack?.querySelector('[data-nse-part="title"][data-nse-role="details"]')).toBeTruthy());
    expect(document.querySelector('[data-nse-control="chronosphere"][data-nse-style="preparation"]')).toBeTruthy();
    expect(document.querySelector('[data-nse-control="chronosphere"][data-nse-style="grid"]')).toBeTruthy();
    expect(stack?.querySelector('[data-nse-part="track"][data-nse-role="timeline"]')).toBeTruthy();
    await waitFor(() => expect(stack?.querySelector('[data-nse-control="visual-effect-view"][data-nse-style="vortex"] [data-nse-part="image"]')).toBeTruthy());
    collect();
  } finally {
    view.unmount();
    controller.abort();
  }
});

it("renders the projected book strips, folded paper and tear hooks", () => {
  const print = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7GwAAAAASUVORK5CYII=";
  const view = render(<Host>
    <PageCurlLeaf preset="bookTurn" progress={0.5} reducedMotion={false} turnSurface={{ front: print, back: print, strips: 2 }} front="Front" inside="Inside" />
    <PageCurlLeaf preset="bookCurl" progress={0.4} reducedMotion={false} backGhost front="Front" inside="Inside" />
    <PageCurlLeaf preset="tearAway" progress={0.4} reducedMotion={false} front="Receipt" />
    <PageCurlLeaf preset="nseSheet" front="Front" inside="Inside" />
    <PageCurlLeaf preset="settingsPeel" front="Front" inside="Inside" />
    <PageCurlLeaf preset="cardFlip" front="Front" back="Reverse" />
  </Host>);
  expect(view.container.querySelector('[data-nse-presentation="book"] [data-nse-part="face"][data-nse-role="page-strip"]')).toBeTruthy();
  expect(view.container.querySelector('[data-nse-part="face"][data-nse-style="fold"]')).toBeTruthy();
  expect(view.container.querySelector('[data-nse-part="attachment"][data-nse-role="page-tear"]')).toBeTruthy();
  collect();
});

it("renders the instance colour hooks", async () => {
  const view = render(<Host>
    <NSEButton title="Action" bezelColour="#c8102e" contentTintColour="#222" />
    <NSEPopUpButton accessibleLabel="Choice" items={[]} bezelColour="#c8102e" contentTintColour="#222" />
    <NSESegmentedControl aria-label="Mode" items={[{ id: "one", label: "One" }]} selectedSegmentBezelColour="#c8102e"
      selection={{ mode: "select-one", selectedIds: new Set(["one"]), allowsEmpty: false }} />
    <NSEBox title="Details" borderColour="#c8102e" />
    <ConfiguredToolbarSpecimen width={500} customising={false} checked="on" />
  </Host>);
  expect(view.container.querySelectorAll('[data-nse-custom-bezel="true"]').length).toBeGreaterThanOrEqual(3);
  await waitFor(() => expect(view.container.querySelector('[data-nse-control="toolbar-item"][data-nse-selected]')).toBeTruthy());
  collect();
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
