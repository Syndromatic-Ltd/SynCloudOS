/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { NSETheme } from "../../../../src/NSE/Theme/NSETheme";
import { atmoTheme } from "../../../../src/NSE/Appearance/atmo";
import { NSEAppearanceProvider, useNSEAppearance } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { NSEImage } from "../../../../src/NSE/Controls/Images/NSEImageResource";
import { NSEButton } from "../../../../src/NSE/Controls/Buttons/NSEButton";
import { NSEBox, NSESwitch } from "../../../../src/NSE/Controls/Fields/NSEFields";
import { NSESearchField } from "../../../../src/NSE/Controls/Fields/NSESearchField";
import { NSESegmentedControl } from "../../../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSEUserDefaultsController } from "../../../../src/NSE/Controllers/NSEUserDefaultsController";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";
import { NSESplitView } from "../../../../src/NSE/DataViews/Split/NSESplitView";
import { MenuView } from "../../../../src/NSE/Menus/MenuView";
import { NSEPopUpButton } from "../../../../src/NSE/Menus/NSEPopUpButton";
import { TabBar } from "../../../../src/NSE/Navigation/TabBar";
import { TabBarController } from "../../../../src/NSE/Navigation/TabBarController";
import tabIcon from "../../../../src/NSE/Navigation/nse-tab-bar-more.svg";
import { StandaloneControlHost } from "../../../../src/NSE/Overlays/NSEStandaloneControlHost";
import { NSEPopover } from "../../../../src/NSE/Overlays/NSEPopover";
import { NSEScroller } from "../../../../src/NSE/Scroll/NSEScroller";
import { NSEToolbarController } from "../../../../src/NSE/Toolbars/NSEToolbarController";
import { ToolbarView } from "../../../../src/NSE/Toolbars/ToolbarView";
import type { ToolbarPreferences, ToolbarRuntimePort } from "../../../../src/NSE/Toolbars/toolbarTypes";
import { StandardWindowView } from "../../../../src/NSE/Windows/StandardWindowView";
import type { WindowRecord } from "../../../../src/SynCloudOS/Windows";
import { AppViewChrome } from "../../../../src/Webspring/AppViewChrome";
import { createStaticPresentationPort } from "../../../fixtures/presentationTraits";
import { defaultsFrom } from "../../../fixtures/userDefaults";
import "../../../../src/NSE/public/styles.css";
import "../../../../src/SynCloudOS/styles/runtime.css";
import "../../../../src/Webspring/WebspringHost.css";
// @ts-expect-error The fixture Vite plugin provides this virtual module.
import { themes } from "virtual:theme-paint-replacement/themes";

const noop = () => undefined;
const parameters = new URLSearchParams(location.search);
const selected = parameters.get("specimen");
const customColour = parameters.has("colour") ? "#c8102e" : undefined;
const disabled = parameters.has("disabled");
const highlighted = parameters.has("highlighted");
const template = parameters.has("template") ? NSEImage.named(NSEImage.goBackTemplateName) : undefined;
const fixtureThemes: Readonly<Record<string, NSETheme>> = themes;
const theme = parameters.get("theme") === "none" ? atmoTheme : fixtureThemes["com.example.magenta"];
if (!theme) throw new Error("The replacement fixture requires com.example.magenta.");

const presentation = createStaticPresentationPort({
  width: selected === "tabs" ? 390 : 1140,
  height: 840,
  reducedMotion: true,
});

function WindowSpecimen({ chrome }: { chrome: "standard" | "metal" }) {
  const { theme } = useNSEAppearance();
  const bounds = { x: 0, y: 0, width: 700, height: 370 };
  const record: WindowRecord = {
    id: "paint-replacement-window-" + chrome,
    runtimeId: "paint-replacement" as WindowRecord["runtimeId"],
    workspaceId: "paint-replacement",
    applicationId: null,
    applicationSessionId: null,
    documentId: null,
    documentAssociationRole: null,
    representedDocument: null,
    toolbar: null,
    role: "standard",
    style: ["titled", "closable", "minimisable", "zoomable", "resizable"],
    title: "Documents",
    content: { rendererId: "paint-replacement", parameters: {} },
    bounds,
    minimumSize: { width: 200, height: 150 },
    maximumSize: null,
    level: "normal",
    parentWindowControllerId: null,
    anchor: null,
    pinned: false,
    state: "open",
    isKey: true,
    isMain: true,
    zIndex: 1,
    mobilePolicy: "fullscreen",
    restorationKey: null,
    smoothSurface: "off",
  };
  return <NSEAppearanceProvider theme={theme} chrome={chrome} projectBoundary={false}>
    <div style={{ position: "relative", width: bounds.width, height: bounds.height }}>
      <StandardWindowView record={record} presentation={{
        kind: "desktop-window", visible: true, bounds,
        safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
        movable: true, resizable: true, titleBarVisible: true,
      }} blocked={false} dirty={false} dispatchCommand={async () => undefined}>
        <p>Window content</p>
      </StandardWindowView>
    </div>
  </NSEAppearanceProvider>;
}

function StageSpecimen() {
  return <div style={{ position: "relative", width: 640, height: 300 }}>
    <AppViewChrome.Root zIndex={1} keyWindow>
      <AppViewChrome.Surface material="metal" hasTitlebar>
        <p>Application content</p>
      </AppViewChrome.Surface>
    </AppViewChrome.Root>
  </div>;
}

function ConfiguredToolbar() {
  const [controller] = useState(() => {
    const values = new Map<string, unknown>();
    const preferences = new NSEUserDefaultsController<ToolbarPreferences>({
      namespace: "paint-replacement-toolbar",
      schema: {
        version: 1,
        defaults: { itemIds: ["save"], displayMode: "icon-and-label", sizeMode: "regular" },
        fields: {
          itemIds: { validate: (value: unknown): value is readonly string[] => Array.isArray(value) },
          displayMode: { validate: (value: unknown): value is ToolbarPreferences["displayMode"] => value === "icon-and-label" },
          sizeMode: { validate: (value: unknown): value is ToolbarPreferences["sizeMode"] => value === "regular" },
        },
        migrations: [],
      },
      defaults: defaultsFrom({
        read: key => values.get(key) ?? null,
        write: (key, value) => { values.set(key, value); },
        remove: key => { values.delete(key); },
      }),
    });
    const runtime: ToolbarRuntimePort = {
      signal: new AbortController().signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validateMany: async requests => new Map(requests.map(request => [request.key, {
          commandId: request.commandId, responderId: "paint-replacement", title: "Save",
          enabled: !disabled, denied: false, hidden: false, state: "off", stale: false,
        }])),
        prepareDispatch: async () => ({ status: "cancelled", reason: "specimen" }),
        dispatch: async commandId => ({ status: "cancelled", commandId, operationId: "paint-replacement", reason: "specimen" }),
      },
    };
    return new NSEToolbarController({
      owner: nseUnowned,
      configuration: {
        identifier: "paint-replacement-toolbar",
        owner: { kind: "window", windowControllerId: "paint-replacement" },
        allowedItemIds: ["save"],
        defaultItemIds: ["save"],
        displayMode: "icon-and-label",
        sizeMode: "regular",
      },
      items: [{ kind: "command", id: "save", label: "Save", paletteLabel: "Save", commandId: "save", icon: <span>S</span>, backgroundTintColour: customColour, bordered: !parameters.has("borderless"), minimumWidth: 210, idealWidth: 240 }],
      preferences,
      runtime,
    });
  });
  useEffect(() => () => controller.dispose(), [controller]);
  return <ToolbarView composition="configured" controller={controller} width={600} interaction={{ parentResponderId: "paint-replacement" }} />;
}

function Tabs() {
  const [controller] = useState(() => new TabBarController<ReactNode>({
    id: "paint-replacement-tabs",
    owner: nseUnowned,
    initialSelectedId: "documents",
    destinations: ["Documents", "Pictures", "Music"].map(label => ({
      id: label.toLowerCase(),
      label,
      icon: { kind: "vector", path: tabIcon },
      render: () => <p>{label}</p>,
    })),
  }));
  useEffect(() => () => controller.dispose(), [controller]);
  return <div style={{ width: 390 }}>
    <TabBar controller={controller} aria-label="Workspace" orientation="horizontal" reducedMotion renderPanels={false} />
  </div>;
}

function Popover() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <>
    <button type="button" ref={setAnchor}>Popover anchor</button>
    <NSEPopover id="paint-replacement-popover" open={anchor !== null} anchor={anchor}
      surface="overlay" parentWindowControllerId={null} onOpenChange={noop} title="Details"
      contentSize={{ width: 480, height: 240 }}>
      <p>Additional options</p>
    </NSEPopover>
  </>;
}

const popup = () => <NSEPopUpButton accessibleLabel="Order" label="Order" labelHidden width={300}
  isEnabled={!disabled} bezelColour={customColour} contentTintColour={template ? customColour : undefined}
  defaultValue="name" items={[{ title: "Name", value: "name" }, { title: "Date", value: "date" }]} />;

function Scrollers() {
  const [horizontal, setHorizontal] = useState(25);
  const [vertical, setVertical] = useState(25);
  return <>
    <NSEScroller orientation="horizontal" value={horizontal} maximum={100} knobProportion={0.25} style={{ width: 200 }} onValueChange={setHorizontal} />
    <NSEScroller orientation="vertical" value={vertical} maximum={100} knobProportion={0.25} style={{ height: 200 }} onValueChange={setVertical} />
  </>;
}

const specimens = {
  "window-standard": () => <WindowSpecimen chrome="standard" />,
  "window-metal": () => <WindowSpecimen chrome="metal" />,
  "stage-window": () => <StageSpecimen />,
  toolbar: () => <ToolbarView composition="children" position="inline" style={{ width: 600 }}><NSEButton title="Open" /></ToolbarView>,
  "toolbar-item": () => <ConfiguredToolbar />,
  tabs: () => <Tabs />,
  segments: () => <NSESegmentedControl aria-label="Display mode" segmentStyle={parameters.has("textured") ? "texturedRounded" : "rounded"} selectedSegmentBezelColour={customColour}
    items={["Icons", "List", "Columns"].map(label => ({ id: label.toLowerCase(), label, width: 192, image: parameters.has("segmentImage") ? <span>{label}</span> : undefined }))}
    selection={{ mode: "select-one", selectedIds: new Set(["icons"]), allowsEmpty: false }} onSelectionChange={noop} />,
  "split-view": () => <NSESplitView sidebar={<p>Sources</p>} defaultSidebarWidth={200} style={{ width: 640, height: 300 }}><p>Contents</p></NSESplitView>,
  menu: () => <MenuView label="Actions" items={[
    { value: "open", label: "Open the selected document in this separate window" },
    { value: "export", label: "Export the selected document" },
    { value: "duplicate", label: "Duplicate the selected document" },
    { value: "reveal", label: "Reveal its containing folder" },
  ]} />,
  popover: () => <Popover />,
  button: () => <NSEButton bezelStyle="rounded" title="Continue" style={{ inlineSize: 700 }}
    bezelColour={customColour} contentTintColour={template ? customColour : undefined} image={template}
    isHighlighted={highlighted} isEnabled={!disabled} />,
  "pop-up-button": popup,
  "pop-up-button-native": popup,
  box: () => <NSEBox title="Document export and display options" titlePosition="atTop" fillColour={parameters.has("colour") ? "#ff00ff" : undefined}
    borderColour={parameters.has("border") ? "#c8102e" : undefined} style={{ width: 620, minHeight: 240 }}><p>Options</p></NSEBox>,
  "search-field": () => <NSESearchField aria-label="Search" width={880} height={36} showsSearchIcon defaultValue="Documents" />,
  switch: () => <NSESwitch aria-label="Sync" />,
  scroller: () => <Scrollers />,
} satisfies Record<string, () => ReactNode>;

const entries = Object.entries(specimens).filter(([id]) => selected === null || id === selected);
if (!entries.length) throw new Error("Unknown paint replacement specimen: " + selected);

function Specimen({ id, render }: { id: string; render: () => ReactNode }) {
  return <section id={id}>
    {id === "pop-up-button-native" ? render() : (
      <StandaloneControlHost document={document} window={window} presentation={presentation}>
        {render()}
      </StandaloneControlHost>
    )}
  </section>;
}

createRoot(document.getElementById("root")!).render(
  <NSEAppearanceProvider theme={theme} colourScheme={parameters.get("scheme") === "dark" ? "dark" : "light"}>
    <main>{entries.map(([id, render]) => <Specimen key={id} id={id} render={render} />)}</main>
  </NSEAppearanceProvider>,
);
